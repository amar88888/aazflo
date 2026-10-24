import { NextResponse } from "next/server";
import { getPnlData } from "@/lib/queries";
import { startOfDayMY, endOfDayMY } from "@/lib/myt";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { sendTelegram } from "@/lib/telegram";
import { PROFIT_TARGET } from "@/lib/constants";

export const dynamic = "force-dynamic";

const GRAPH = "https://graph.facebook.com/v21.0";

// 📊 UNTUNG PING — untung bersih SEBENAR hari ni vs target, terus ke Telegram (user tak payah monitor sendiri).
// Jadual: 12:30, 16:30, 21:30 MYT. GET /api/cron/untung-ping?secret=XXX
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const now = new Date();
  const p = await getPnlData(startOfDayMY(now), endOfDayMY(now));
  const roas = p.adsSpend > 0 ? p.revenue / p.adsSpend : 0;

  // Budget adset aktif sekarang (Meta)
  let budgets = "";
  const cfg = await getMetaCreds();
  if (cfg) {
    const qs = new URLSearchParams({
      fields: "name,daily_budget",
      effective_status: "['ACTIVE']",
      limit: "50",
      access_token: cfg.accessToken,
    }).toString();
    const r = await fetch(`${GRAPH}/${cfg.adAccountId}/adsets?${qs}`, { cache: "no-store" });
    const rows: { name: string; daily_budget?: string }[] = (await r.json()).data ?? [];
    budgets = rows
      .map((s) => `${s.name.split(" - ")[0].replace("FACELIM ", "")} RM${Math.round(parseInt(s.daily_budget || "0") / 100)}`)
      .join(" · ");
  }

  const net = p.netProfit;
  const status =
    net >= PROFIT_TARGET.goal
      ? "🏆 Lepas sasaran!"
      : net >= PROFIT_TARGET.floor
        ? `✅ Lepas minimum. RM${(PROFIT_TARGET.goal - net).toFixed(0)} lagi ke sasaran.`
        : net >= 0
          ? `🟡 RM${(PROFIT_TARGET.floor - net).toFixed(0)} lagi ke minimum RM${PROFIT_TARGET.floor}.`
          : "🔴 Masih rugi — sistem pantau & potong ad rugi.";
  const hhmm = new Date(now.getTime() + 8 * 3600 * 1000).toISOString().slice(11, 16);

  const msg =
    `📊 <b>UNTUNG HARI NI</b> (${hhmm})\n` +
    `Untung bersih: <b>RM${net.toFixed(0)}</b> · target RM${PROFIT_TARGET.floor}–${PROFIT_TARGET.goal}\n` +
    `Revenue RM${p.revenue.toFixed(0)} · Iklan RM${p.adsSpend.toFixed(0)} · ROAS sebenar ${roas.toFixed(2)}x\n` +
    `${status}` +
    (budgets ? `\nBudget: ${budgets}` : "");
  const sent = await sendTelegram(msg);
  return NextResponse.json({ ok: true, sent: sent.ok, net, revenue: p.revenue, adsSpend: p.adsSpend, roas });
}
