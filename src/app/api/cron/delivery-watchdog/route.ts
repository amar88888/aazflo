import { NextResponse } from "next/server";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { sendTelegram } from "@/lib/telegram";

const GRAPH = "https://graph.facebook.com/v21.0";

// 🛡️ PENJAGA DELIVERY IKLAN — kesan iklan yang SEPATUTNYA jalan tapi TAK KELUAR:
//  1. Adset ACTIVE tapi 0 ad aktif (semua ad paused) = silent death, rugi jualan senyap
//  2. Campaign ACTIVE tapi 0 impresi hari ni selepas pukul 9 pagi = tak deliver
// Alert Telegram serta-merta. Jalan tiap jam (scheduler dalaman).
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const cfg = await getMetaCreds();
  if (!cfg) return NextResponse.json({ ok: false, message: "Meta belum di-setup" }, { status: 400 });
  const { accessToken, adAccountId } = cfg;
  const gget = async (path: string, params: Record<string, string>) => {
    const qs = new URLSearchParams({ ...params, access_token: accessToken }).toString();
    const r = await fetch(`${GRAPH}/${path}?${qs}`, { cache: "no-store" });
    return r.json();
  };

  const alerts: string[] = [];
  const mytHour = new Date(Date.now() + 8 * 3600 * 1000).getUTCHours();

  // Semua campaign AKTIF + insight impresi hari ni
  const camps = await gget(`${adAccountId}/campaigns`, {
    fields: "name,effective_status,insights.date_preset(today){impressions}",
    effective_status: '["ACTIVE"]',
    limit: "100",
  });
  for (const c of camps.data ?? []) {
    const imp = Number(c.insights?.data?.[0]?.impressions ?? 0);
    // Adset aktif + kira ad aktif dalamnya
    const adsets = await gget(`${c.id}/adsets`, { fields: "name,effective_status", effective_status: '["ACTIVE"]', limit: "50" });
    for (const s of adsets.data ?? []) {
      const ads = await gget(`${s.id}/ads`, { fields: "effective_status", effective_status: '["ACTIVE"]', limit: "50" });
      const activeAds = (ads.data ?? []).length;
      if (activeAds === 0) {
        alerts.push(`🔴 <b>${esc(c.name)}</b>\nAdset "${esc(s.name)}" AKTIF tapi 0 ad hidup — tak deliver, rugi jualan!`);
      }
    }
    // Campaign aktif tapi 0 impresi selepas 9 pagi
    if (imp === 0 && mytHour >= 9 && mytHour <= 23) {
      alerts.push(`🟠 <b>${esc(c.name)}</b>\nActive tapi 0 impresi hari ni (jam ${mytHour}:00) — tak deliver.`);
    }
  }

  // Dedupe + hantar (cooldown 3 jam seperti pengawal lain)
  const g = globalThis as { __delivWatch?: { sent: Set<string>; at: number } };
  const st = (g.__delivWatch ??= { sent: new Set(), at: 0 });
  const fresh = alerts.filter((a) => !st.sent.has(a));
  const force = url.searchParams.get("force") === "1";
  let sent = false;
  if ((fresh.length > 0 || (alerts.length > 0 && Date.now() - st.at > 3 * 3600_000)) && (url.searchParams.get("send") === "1" || force)) {
    const r = await sendTelegram(`🛡️ <b>Penjaga Delivery Iklan</b>\n\n${alerts.join("\n\n")}\n\n<i>Hidupkan ad dalam adset, atau semak di Ads Manager.</i>`);
    sent = r.ok;
    if (r.ok) {
      st.at = Date.now();
      for (const a of alerts) st.sent.add(a);
    }
  }
  if (force && alerts.length === 0) await sendTelegram("🛡️ Penjaga Delivery: semua iklan deliver elok ✓").catch(() => {});
  return NextResponse.json({ ok: true, alerts, sent, mytHour });
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
