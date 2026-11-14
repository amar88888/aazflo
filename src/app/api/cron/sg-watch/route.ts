import { NextResponse } from "next/server";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { sendTelegram } from "@/lib/telegram";
import { setSetting } from "@/lib/settings";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";
const PUR = new Set(["purchase", "omni_purchase", "offsite_conversion.fb_pixel_purchase"]);
const SG_CAMPAIGN = "120251751539750356"; // FACELIM SG - LIVE 7 OKT
// Ad SG yang bawa order — mesti sentiasa ON bila SG hidup (11 & 14 Nov flop sebab dia ter-OFF)
const SG_CHAMPIONS = ["120251862751940356"]; // FACELIM SG - IMG_6851 pemenang

// Ambang "sihat" SG (selepas trim + cap auto-profit RM800).
// Nilai asal dikira bila Purchase SG BERGANDA (PixelYourSite). 24 Okt plugin dibuang → purchase 1x:
// CPP sebenar ×2, ROAS sebenar ×0.5 — ambang diselaraskan supaya tindakan sama dengan dulu.
const CPP_OK = 100; // dulu 50 (19 Okt SG RM43 berganda)
const CPP_BAD = 130; // dulu 65 (20 Okt SG RM71 berganda — tepu)

// Ambang AUTO-CUT — SG betul-betul bleeding → pause SENDIRI hari tu (dayparting cuba balik esok).
// 15 Nov: budget SG kini RM150-300 → ambang lama RM300 tak pernah sampai. AOV SG ~RM180, breakeven CPP ~RM110.
const CUT_MIN_SPEND = 80; // bawah ni belum nilai langsung
const CUT_ZERO_SALE_SPEND = 120; // RM120+ hari ni & 0 sale = bakar → cut
const CUT_BLEED_SPEND = 180; // ada sale tapi mahal — nilai lepas RM180
const CUT_ROAS = 0.75; // dulu 1.5 berganda — ROAS bawah ni = bawah breakeven = rugi
const CUT_CPP = 170; // dulu 85 berganda — CPP atas ni = terlalu mahal, bakar

function ymd(offset = 0): string {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
}

// 🇸🇬 SG WATCHDOG — pantau CPP/ROAS SG selepas trim; alert kalau mahal balik (tepu).
// GET /api/cron/sg-watch?secret=XXX
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const cfg = await getMetaCreds();
  if (!cfg) return NextResponse.json({ ok: false, message: "Meta belum di-setup" }, { status: 400 });
  const { accessToken, adAccountId } = cfg;

  const sgStats = async (day: string) => {
    const qs = new URLSearchParams({
      level: "campaign",
      time_range: JSON.stringify({ since: day, until: day }),
      fields: "campaign_name,spend,actions,action_values,cpm,frequency",
      limit: "100",
      access_token: accessToken,
    }).toString();
    const r = await fetch(`${GRAPH}/${adAccountId}/insights?${qs}`, { cache: "no-store" });
    const rows = (await r.json()).data ?? [];
    let spend = 0,
      pur = 0,
      val = 0;
    for (const row of rows) {
      const nm = (row.campaign_name || "").toUpperCase();
      if (!nm.includes("SG") || nm.includes("MAXLIM")) continue;
      spend += parseFloat(row.spend || "0");
      for (const a of row.actions || []) if (a.action_type === "purchase") pur += parseInt(a.value);
      for (const a of row.action_values || []) if (PUR.has(a.action_type)) val += parseFloat(a.value);
    }
    return { spend, pur, val, cpp: pur ? spend / pur : 0, roas: spend ? val / spend : 0 };
  };

  const gpost = async (id: string, body: Record<string, string>) => {
    const r = await fetch(`${GRAPH}/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ ...body, access_token: accessToken }).toString(),
    });
    const j = await r.json().catch(() => ({}));
    return r.ok && !j.error;
  };
  const mytHour = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();
  const regularPing = mytHour === 12 || mytHour === 16; // laporan biasa 2x sehari; jam lain alert je bila ada masalah

  // 🏆 PENGAWAL CHAMPION — 14 Nov: IMG_6851 mati hampir sehari, Meta tolak duit ke IMG_6863 → RM185, 0 order.
  // Bila SG campaign hidup tapi champion tak ACTIVE → hidupkan balik + alert.
  const championNotes: string[] = [];
  try {
    const camp = await fetch(`${GRAPH}/${SG_CAMPAIGN}?fields=effective_status&access_token=${accessToken}`, { cache: "no-store" }).then((r) => r.json());
    if (camp.effective_status === "ACTIVE") {
      for (const id of SG_CHAMPIONS) {
        const ad = await fetch(`${GRAPH}/${id}?fields=name,status,effective_status&access_token=${accessToken}`, { cache: "no-store" }).then((r) => r.json());
        if (ad.status === "PAUSED") {
          const ok = await gpost(id, { status: "ACTIVE" });
          championNotes.push(`${ok ? "✅ Hidup balik" : "❌ GAGAL hidupkan"} champion SG "${ad.name}" (tadi PAUSED)`);
        } else if (ad.effective_status && !["ACTIVE", "IN_PROCESS", "PENDING_REVIEW"].includes(ad.effective_status)) {
          championNotes.push(`⚠️ Champion SG "${ad.name}" status ${ad.effective_status} — check manual`);
        }
      }
    }
  } catch (e) {
    championNotes.push(`⚠️ Semak champion SG gagal: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (championNotes.length) await sendTelegram(`🏆 <b>SG Champion Guard</b>\n${championNotes.join("\n")}`);

  const today = await sgStats(ymd(0));
  const yest = await sgStats(ymd(1));

  // Belum cukup belanja utk dinilai (pagi awal) — jangan alert palsu.
  if (today.spend < CUT_MIN_SPEND) {
    return NextResponse.json({ ok: true, skipped: "belanja SG belum cukup utk dinilai", today, championNotes });
  }

  // 🔪 AUTO-CUT — SG bleeding selepas belanja cukup → pause SENDIRI (tak tunggu manual).
  // 15 Nov FIX: dulu 0 sale = cpp 0 & roas 0 → syarat tak pernah kena (14 Nov RM185 0 order lepas).
  const zeroSale = today.pur === 0 && today.spend >= CUT_ZERO_SALE_SPEND;
  const bleeding =
    zeroSale ||
    (today.pur > 0 && today.spend >= CUT_BLEED_SPEND && (today.roas < CUT_ROAS || today.cpp >= CUT_CPP));
  if (bleeding) {
    await setSetting("sg_cut_day", ymd(0)); // auto-profit self-heal hormat ni — jangan hidupkan balik hari sama
    const r = await fetch(`${GRAPH}/${SG_CAMPAIGN}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ status: "PAUSED", access_token: accessToken }).toString(),
    });
    const cut = r.ok && !(await r.clone().json()).error;
    await sendTelegram(
      `🔪 <b>SG AUTO-CUT</b> — SG bleeding, dipotong terus.\n` +
        `CPP RM${today.cpp.toFixed(0)} · ROAS ${today.roas.toFixed(2)}x · ${today.pur} sale · belanja RM${today.spend.toFixed(0)}\n` +
        (cut ? "SG PAUSED. Dayparting cuba balik esok (hari jualan). Jimat duit, tak bakar." : "⚠️ Gagal pause — check manual.")
    );
    return NextResponse.json({ ok: true, action: "auto-cut", cut, today, yest });
  }

  const verdict =
    today.cpp > 0 && today.cpp <= CPP_OK
      ? "✅ SG efisien balik — CPP sihat, trim berjaya."
      : today.cpp >= CPP_BAD
        ? "⚠️ SG CPP masih MAHAL — pasu masih tepu, pertimbang trim lagi."
        : "🟡 SG sederhana — pantau.";

  const msg =
    `🇸🇬 <b>SG Watchdog</b>\n` +
    `CPP hari ni: <b>RM${today.cpp.toFixed(0)}</b> (semalam RM${yest.cpp.toFixed(0)})\n` +
    `ROAS ${today.roas.toFixed(2)}x · ${today.pur} sale · belanja RM${today.spend.toFixed(0)}\n` +
    `${verdict}`;
  // Jalan tiap jam sekarang — laporan biasa 2x sehari je; jam lain hantar kalau CPP mahal (amaran awal)
  if (regularPing || today.cpp >= CPP_BAD) await sendTelegram(msg);

  return NextResponse.json({ ok: true, today, yest, verdict });
}
