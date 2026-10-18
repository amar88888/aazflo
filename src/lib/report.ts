import { db } from "@/lib/db";
import { getPnlData } from "@/lib/queries";
import { formatRM } from "@/lib/format";
import { DATA_START, SGD_TO_MYR, PROFIT_TARGET } from "@/lib/constants";
import { subDays, format } from "date-fns";
import { startOfDayMY as startOfDay, endOfDayMY as endOfDay, startOfMonthMY as startOfMonth, toMytWall } from "@/lib/myt";

const ACTIVE = ["pending", "printed", "shipped", "completed"];

const STORE_LABELS: Record<string, string> = {
  facelim: "Facelim MY",
  facelimsg: "Facelim SG",
  maxlim: "Maxlim MY",
  maxlimsg: "Maxlim SG",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Report harian dalam HTML (parse_mode Telegram = HTML).
// Fokus UNTUNG: jualan per kedai (RM, SG ditukar), kos iklan, untung bersih hari tu + bulan ni.
// `yesterday` = true untuk laporan pagi (rumusan semalam penuh).
export async function buildDailyReport(opts: { yesterday?: boolean } = {}): Promise<string> {
  const now = new Date();
  const day = opts.yesterday ? subDays(now, 1) : now;
  const ds = startOfDay(day);
  const de = endOfDay(day);

  const dayOrders = await db.order.findMany({
    where: { orderedAt: { gte: ds, lte: de }, status: { in: ACTIVE } },
    select: { store: true, total: true },
  });
  const byStore: Record<string, { n: number; rm: number }> = {};
  for (const o of dayOrders) {
    const k = o.store || "lain";
    const rm = /sg/i.test(k) ? o.total * SGD_TO_MYR : o.total;
    byStore[k] ??= { n: 0, rm: 0 };
    byStore[k].n++;
    byStore[k].rm += rm;
  }

  const pnlDay = await getPnlData(ds, de);
  const monthFrom = startOfMonth(now) < DATA_START ? DATA_START : startOfMonth(now);
  const pnlMonth = await getPnlData(monthFrom, endOfDay(now));
  const roas = pnlDay.adsSpend > 0 ? pnlDay.revenue / pnlDay.adsSpend : 0;

  const pendingAwb = await db.order.count({ where: { status: "pending", orderedAt: { gte: DATA_START } } });
  const unpaid = await db.order.count({ where: { status: "unpaid", orderedAt: { gte: ds, lte: de } } });
  const returnsOpen = await db.order.count({
    where: { returnStatus: { in: ["requested", "approved", "returned"] }, orderedAt: { gte: DATA_START } },
  });

  const untung = pnlDay.netProfit;
  const L: string[] = [];
  L.push(`<b>${opts.yesterday ? "☀️ Laporan Pagi" : "📊 Laporan Harian"} Aazflo</b>`);
  L.push(`🗓 ${format(toMytWall(day), "EEEE, dd MMM yyyy")}${opts.yesterday ? " (semalam)" : ""}`);
  L.push("");
  L.push(`<b>${untung >= 0 ? "🟢" : "🔴"} Untung bersih: ${formatRM(untung)}</b>`);
  // 🎯 Target harian
  if (untung >= PROFIT_TARGET.goal) L.push(`🏆 Target ${formatRM(PROFIT_TARGET.goal)} TERCAPAI!`);
  else if (untung >= PROFIT_TARGET.floor)
    L.push(`✅ Lepas minimum ${formatRM(PROFIT_TARGET.floor)} · ${formatRM(PROFIT_TARGET.goal - untung)} lagi ke sasaran ${formatRM(PROFIT_TARGET.goal)}`);
  else L.push(`🎯 ${formatRM(PROFIT_TARGET.floor - untung)} lagi untuk cecah minimum ${formatRM(PROFIT_TARGET.floor)}`);
  L.push(`Jualan ${formatRM(pnlDay.revenue)} · ${dayOrders.length} order`);
  L.push(`Iklan ${formatRM(pnlDay.adsSpend)}${roas > 0 ? ` · ROAS ${roas.toFixed(2)}x` : ""}`);
  L.push(`Kos barang ${formatRM(pnlDay.cogs)} · Pos/COD ${formatRM(pnlDay.shipping)}`);
  L.push("");
  L.push("<b>🏪 Ikut Kedai</b>");
  const keys = Object.keys(byStore).sort((a, b) => byStore[b].rm - byStore[a].rm);
  if (keys.length === 0) L.push("• Tiada order");
  for (const k of keys) {
    L.push(`• ${esc(STORE_LABELS[k] ?? k)}: ${formatRM(byStore[k].rm)} (${byStore[k].n})`);
  }
  if (unpaid > 0) L.push(`• Belum bayar (tak dikira): ${unpaid}`);
  L.push("");
  L.push("<b>📈 Bulan Ni</b>");
  L.push(`• Untung bersih: <b>${formatRM(pnlMonth.netProfit)}</b> (${pnlMonth.marginPct.toFixed(1)}%)`);
  L.push(`• Jualan ${formatRM(pnlMonth.revenue)} · Iklan ${formatRM(pnlMonth.adsSpend)}`);
  L.push("");
  L.push("<b>📦 Operasi</b>");
  L.push(`• AWB belum print: ${pendingAwb}`);
  L.push(`• Return aktif: ${returnsOpen}`);

  return L.join("\n");
}
