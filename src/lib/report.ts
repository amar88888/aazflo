import { db } from "@/lib/db";
import { getPnlData } from "@/lib/queries";
import { formatRM } from "@/lib/format";
import { PLATFORMS, PLATFORM_LABELS, type Platform } from "@/lib/constants";
import { startOfDay, endOfDay, startOfMonth, endOfMonth, format } from "date-fns";

const ACTIVE = ["pending", "printed", "shipped", "completed"];

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Report harian dalam HTML (parse_mode Telegram = HTML).
export async function buildDailyReport(): Promise<string> {
  const now = new Date();
  const ds = startOfDay(now);
  const de = endOfDay(now);

  const todayOrders = await db.order.findMany({
    where: { orderedAt: { gte: ds, lte: de }, status: { in: ACTIVE } },
    select: { platform: true, total: true },
  });
  const revToday = todayOrders.reduce((s, o) => s + o.total, 0);

  const pendingAwb = await db.order.groupBy({ by: ["platform"], where: { status: "pending" }, _count: true });
  const pendingMap: Record<string, number> = {};
  for (const x of pendingAwb) pendingMap[x.platform] = x._count;
  const pendingTotal = pendingAwb.reduce((s, x) => s + x._count, 0);

  const deliveredToday = await db.order.count({ where: { deliveredAt: { gte: ds, lte: de } } });
  const returnsOpen = await db.order.count({ where: { returnStatus: { in: ["requested", "approved", "returned"] } } });

  const pnl = await getPnlData(startOfMonth(now), endOfMonth(now));

  const attToday = await db.attendance.findMany({ where: { date: { gte: ds, lte: de } } });
  const partTimers = attToday.reduce((s, a) => s + a.partTimers, 0);
  const balance = (await db.cashTxn.findMany()).reduce((s, t) => s + (t.type === "topup" ? t.amount : -t.amount), 0);
  const reorder = (await db.supply.findMany()).filter((s) => s.currentStock <= s.reorderLevel);

  const L: string[] = [];
  L.push("<b>📊 Report Harian Aazflo</b>");
  L.push(`🗓 ${format(now, "EEEE, dd MMM yyyy")}`);
  L.push("");
  L.push("<b>💰 Jualan Hari Ni</b>");
  L.push(`Total: <b>${formatRM(revToday)}</b> · ${todayOrders.length} order`);
  for (const p of PLATFORMS) {
    const os = todayOrders.filter((o) => o.platform === p);
    L.push(`• ${PLATFORM_LABELS[p as Platform]}: ${formatRM(os.reduce((s, o) => s + o.total, 0))} (${os.length})`);
  }
  L.push("");
  L.push(`<b>📦 AWB Belum Print: ${pendingTotal}</b>`);
  for (const p of PLATFORMS) if (pendingMap[p]) L.push(`• ${PLATFORM_LABELS[p as Platform]}: ${pendingMap[p]}`);
  L.push("");
  L.push("<b>🚚 Penghantaran</b>");
  L.push(`• Sampai hari ni: ${deliveredToday}`);
  L.push(`• Return aktif: ${returnsOpen}`);
  L.push("");
  L.push("<b>📈 P&amp;L Bulan Ni</b>");
  L.push(`• Revenue: ${formatRM(pnl.revenue)}`);
  L.push(`• Net profit: ${formatRM(pnl.netProfit)} (${pnl.marginPct.toFixed(1)}%)`);
  L.push("");
  L.push("<b>🏢 Office</b>");
  L.push(`• Part-timer hari ni: ${partTimers}`);
  L.push(`• Baki duit office: ${formatRM(balance)}`);
  if (reorder.length) {
    L.push(`• ⚠️ Perlu order: ${reorder.map((s) => `${esc(s.name)} (${s.currentStock})`).join(", ")}`);
  } else {
    L.push("• Stok barang: semua cukup ✓");
  }

  return L.join("\n");
}
