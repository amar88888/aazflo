import { NextResponse } from "next/server";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";

// ── Peraturan (deterministik, bukan agak-agak) ──
// Meta over-report ~1.8x; breakeven sebenar ~1.65x → breakeven Meta-ROAS ~3.0x.
const ROAS_PAUSE = 2.5;      // bawah ni (selepas belanja cukup) = rugi → pause
const ROAS_SCALE = 5.0;      // atas ni (sebenar ~2.8x) = kuat → boleh scale
const SPEND_PAUSE_3D = 100;  // RM belanja 3 hari sebelum layak dinilai utk pause
const SPEND_TODAY_DEAD = 50; // RM belanja hari ni + 0 jualan = pause
const SPEND_SCALE_3D = 300;  // RM belanja 3 hari (volume terbukti) sebelum scale
const SCALE_STEP = 1.2;      // naik +20% je (selamat)
const CAP_TOTAL = 1500;      // cap budget harian akaun (RM)

type AdRow = { id: string; name: string; status: string; adsetId: string; adsetName: string; budget: number; spend3: number; pur3: number; roas3: number; spendToday: number; purToday: number };

function purchasesOf(actions: { action_type: string; value: string }[] | undefined): number {
  let p = 0;
  for (const a of actions || []) if (a.action_type.includes("purchase")) p = Math.max(p, Math.round(parseFloat(a.value)));
  return p;
}
function valueOf(av: { action_type: string; value: string }[] | undefined): number {
  let v = 0;
  for (const a of av || []) if (a.action_type.includes("purchase")) v = Math.max(v, parseFloat(a.value));
  return v;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  // dryrun default TRUE — hanya bertindak bila &dryrun=0
  const dryrun = url.searchParams.get("dryrun") !== "0";

  const cfg = await getMetaCreds();
  if (!cfg || !cfg.accessToken || !cfg.adAccountId) return NextResponse.json({ ok: false, message: "Meta belum di-setup" }, { status: 400 });
  const { accessToken, adAccountId } = cfg;

  const gget = async (path: string, params: Record<string, string>) => {
    const qs = new URLSearchParams({ ...params, access_token: accessToken }).toString();
    const r = await fetch(`${GRAPH}/${path}?${qs}`, { cache: "no-store" });
    return r.json();
  };
  const gpost = async (path: string, body: Record<string, string>) => {
    const r = await fetch(`${GRAPH}/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...body, access_token: accessToken }).toString(),
    });
    const j = await r.json();
    return r.ok && !j.error ? { ok: true } : { ok: false, error: j.error?.error_user_msg || j.error?.message || "gagal" };
  };

  try {
    // Ambil semua ad aktif + adset (budget) + insight 3 hari & hari ni
    const fields =
      "id,name,effective_status,adset{id,name,daily_budget,effective_status}," +
      "insights.date_preset(last_3d){spend,actions,action_values}";
    const adsRes = await gget(`${adAccountId}/ads`, { fields, limit: "300", effective_status: "['ACTIVE']" });
    const todayRes = await gget(`${adAccountId}/ads`, {
      fields: "id,insights.date_preset(today){spend,actions}",
      limit: "300",
      effective_status: "['ACTIVE']",
    });
    const todayMap = new Map<string, { spend: number; pur: number }>();
    for (const a of todayRes.data || []) {
      const ins = a.insights?.data?.[0];
      todayMap.set(a.id, { spend: ins ? parseFloat(ins.spend || "0") : 0, pur: purchasesOf(ins?.actions) });
    }

    const ads: AdRow[] = [];
    const activePerAdset = new Map<string, number>();
    for (const a of adsRes.data || []) {
      const ins = a.insights?.data?.[0];
      const spend3 = ins ? parseFloat(ins.spend || "0") : 0;
      const pur3 = purchasesOf(ins?.actions);
      const val3 = valueOf(ins?.action_values);
      const t = todayMap.get(a.id) || { spend: 0, pur: 0 };
      const adsetId = a.adset?.id ?? "";
      activePerAdset.set(adsetId, (activePerAdset.get(adsetId) ?? 0) + 1);
      ads.push({
        id: a.id, name: a.name, status: a.effective_status, adsetId, adsetName: a.adset?.name ?? "",
        budget: a.adset?.daily_budget ? parseInt(a.adset.daily_budget) / 100 : 0,
        spend3, pur3, roas3: spend3 > 0 ? val3 / spend3 : 0, spendToday: t.spend, purToday: t.pur,
      });
    }

    // Budget SEBENAR semua adset aktif (authoritative — utk cap yang tepat)
    const adsetRes = await gget(`${adAccountId}/adsets`, { fields: "id,name,daily_budget", limit: "200", effective_status: "['ACTIVE']" });
    const budgetById = new Map<string, number>();
    let totalBudget = 0;
    for (const s of adsetRes.data || []) {
      const b = s.daily_budget ? parseInt(s.daily_budget) / 100 : 0;
      budgetById.set(s.id, b);
      totalBudget += b;
    }
    // Adset yang ada ad aktif (calon scale)
    const adsetBudget = new Map<string, { name: string; budget: number }>();
    for (const a of ads) if (!adsetBudget.has(a.adsetId)) adsetBudget.set(a.adsetId, { name: a.adsetName, budget: budgetById.get(a.adsetId) ?? a.budget });

    const actions: string[] = [];

    // ── A) PAUSE iklan rugi (JANGAN kosongkan adset) ──
    for (const a of ads) {
      const deadToday = a.spendToday >= SPEND_TODAY_DEAD && a.purToday === 0;
      const loser3d = a.spend3 >= SPEND_PAUSE_3D && a.roas3 < ROAS_PAUSE;
      if (!deadToday && !loser3d) continue;
      if ((activePerAdset.get(a.adsetId) ?? 0) <= 1) {
        actions.push(`⏸️ SKIP pause "${a.name.slice(0, 30)}" — iklan terakhir dlm adset (tak kosongkan)`);
        continue;
      }
      const why = deadToday ? `RM${a.spendToday.toFixed(0)} hari ni 0 jualan` : `3hr ROAS ${a.roas3.toFixed(1)}x (rugi)`;
      if (!dryrun) {
        const r = await gpost(a.id, { status: "PAUSED" });
        if (!r.ok) { actions.push(`❌ pause gagal "${a.name.slice(0, 24)}": ${r.error}`); continue; }
      }
      activePerAdset.set(a.adsetId, (activePerAdset.get(a.adsetId) ?? 1) - 1);
      actions.push(`${dryrun ? "[DRY] " : ""}⏸️ PAUSE "${a.name.slice(0, 30)}" — ${why}`);
    }

    // ── B) SCALE adset winner (+20%, cap RM${CAP_TOTAL}) ──
    for (const [adsetId, info] of adsetBudget) {
      const adsetAds = ads.filter((a) => a.adsetId === adsetId);
      const spend3 = adsetAds.reduce((s, a) => s + a.spend3, 0);
      const val3 = adsetAds.reduce((s, a) => s + a.roas3 * a.spend3, 0);
      const roas3 = spend3 > 0 ? val3 / spend3 : 0;
      if (roas3 < ROAS_SCALE || spend3 < SPEND_SCALE_3D) continue;
      let next = Math.round(info.budget * SCALE_STEP);
      const headroom = CAP_TOTAL - (totalBudget - info.budget);
      if (next > headroom) next = Math.floor(headroom);
      if (next <= info.budget) { actions.push(`🔒 "${info.name.slice(0, 24)}" layak scale tapi cap RM${CAP_TOTAL} penuh`); continue; }
      if (!dryrun) {
        const r = await gpost(adsetId, { daily_budget: String(next * 100) });
        if (!r.ok) { actions.push(`❌ scale gagal "${info.name.slice(0, 24)}": ${r.error}`); continue; }
      }
      totalBudget += next - info.budget;
      actions.push(`${dryrun ? "[DRY] " : ""}🚀 SCALE "${info.name.slice(0, 30)}" RM${info.budget}→RM${next} (ROAS ${roas3.toFixed(1)}x)`);
    }

    // ── C) REPORT Telegram ──
    const totSpendToday = [...todayMap.values()].reduce((s, x) => s + x.spend, 0);
    const head = dryrun ? "🤖 AUTO-PROFIT (DRY-RUN — tiada tindakan sebenar)" : "🤖 AUTO-PROFIT";
    const lines = [
      head,
      `Belanja hari ni: RM${totSpendToday.toFixed(0)} · budget harian: RM${totalBudget.toFixed(0)}/${CAP_TOTAL}`,
      "",
      actions.length ? actions.join("\n") : "✅ Semua sihat — tiada pause/scale perlu.",
    ];
    await sendTelegram(lines.join("\n"));

    return NextResponse.json({ ok: true, dryrun, totalBudget, spendToday: Math.round(totSpendToday), actions });
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
