import { db } from "@/lib/db";
import { PLATFORMS, DATA_START, SGD_TO_MYR, type Platform } from "@/lib/constants";

// Order kedai SG dalam SGD — tukar total & harga item ke RM (in-memory) sebelum kira.
// shippingFee SG dah dalam RM (RM17/RM25), jadi tak ditukar.
function toMyr<T extends { store: string; total: number; items?: { unitPrice: number }[] }>(list: T[]): T[] {
  for (const o of list) {
    if (/sg/i.test(o.store)) {
      o.total *= SGD_TO_MYR;
      for (const it of o.items ?? []) it.unitPrice *= SGD_TO_MYR;
    }
  }
  return list;
}
import { getPlatformFees } from "@/lib/settings";
import { subDays, addDays, subMonths, subYears, differenceInCalendarDays, format } from "date-fns";
// Sempadan tarikh ikut MYT (server jalan UTC) — ganti startOfDay/endOfDay date-fns.
import {
  startOfDayMY as startOfDay,
  endOfDayMY as endOfDay,
  startOfMonthMY as startOfMonth,
  endOfMonthMY as endOfMonth,
  startOfYearMY as startOfYear,
  endOfYearMY as endOfYear,
  toMytWall,
} from "@/lib/myt";

const ACTIVE_STATUSES = ["pending", "printed", "shipped", "completed"];

export const DASHBOARD_PERIODS = [
  { key: "today", label: "Hari Ni" },
  { key: "yesterday", label: "Semalam" },
  { key: "7d", label: "7 Hari" },
  { key: "30d", label: "30 Hari" },
  { key: "month", label: "Bulan Ni" },
  { key: "year", label: "Tahun Ni" },
] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number]["key"];

export type DashRange = {
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  label: string;
  deltaLabel: string;
  gran: "hour" | "day" | "month";
};

export function resolvePeriodRange(period: DashboardPeriod, now: Date = new Date()): DashRange {
  switch (period) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now), prevFrom: startOfDay(subDays(now, 1)), prevTo: endOfDay(subDays(now, 1)), label: "Hari Ni", deltaLabel: "vs semalam", gran: "hour" };
    case "yesterday": {
      const y = subDays(now, 1);
      return { from: startOfDay(y), to: endOfDay(y), prevFrom: startOfDay(subDays(now, 2)), prevTo: endOfDay(subDays(now, 2)), label: "Semalam", deltaLabel: "vs kelmarin", gran: "hour" };
    }
    case "7d":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now), prevFrom: startOfDay(subDays(now, 13)), prevTo: endOfDay(subDays(now, 7)), label: "7 Hari", deltaLabel: "vs 7 hari lepas", gran: "day" };
    case "month": {
      const s = startOfMonth(now);
      return { from: s, to: endOfDay(now), prevFrom: startOfMonth(subMonths(now, 1)), prevTo: endOfMonth(subMonths(now, 1)), label: "Bulan Ni", deltaLabel: "vs bulan lepas", gran: "day" };
    }
    case "year": {
      const s = startOfYear(now);
      return { from: s, to: endOfDay(now), prevFrom: startOfYear(subYears(now, 1)), prevTo: endOfYear(subYears(now, 1)), label: "Tahun Ni", deltaLabel: "vs tahun lepas", gran: "month" };
    }
    case "30d":
    default:
      return { from: startOfDay(subDays(now, 29)), to: endOfDay(now), prevFrom: startOfDay(subDays(now, 59)), prevTo: endOfDay(subDays(now, 30)), label: "30 Hari", deltaLabel: "vs 30 hari lepas", gran: "day" };
  }
}

// Tarikh / bulan / tahun tertentu → Range custom.
export function resolveCustomRange(kind: "date" | "month" | "year", value: string, now: Date = new Date()): DashRange | null {
  if (kind === "date") {
    const d = new Date(`${value}T00:00:00`);
    if (isNaN(d.getTime())) return null;
    const prev = subDays(d, 1);
    return { from: startOfDay(d), to: endOfDay(d), prevFrom: startOfDay(prev), prevTo: endOfDay(prev), label: format(d, "dd MMM yyyy"), deltaLabel: "vs sehari sebelum", gran: "hour" };
  }
  if (kind === "month") {
    const d = new Date(`${value}-01T00:00:00`);
    if (isNaN(d.getTime())) return null;
    const p = subMonths(d, 1);
    const to = Math.min(endOfMonth(d).getTime(), endOfDay(now).getTime());
    return { from: startOfMonth(d), to: new Date(to), prevFrom: startOfMonth(p), prevTo: endOfMonth(p), label: format(d, "MMMM yyyy"), deltaLabel: "vs bulan sebelum", gran: "day" };
  }
  const y = parseInt(value, 10);
  if (isNaN(y) || y < 2000 || y > 2100) return null;
  const d = new Date(y, 0, 1);
  const p = new Date(y - 1, 0, 1);
  const to = Math.min(endOfYear(d).getTime(), endOfDay(now).getTime());
  return { from: startOfYear(d), to: new Date(to), prevFrom: startOfYear(p), prevTo: endOfYear(p), label: String(y), deltaLabel: "vs tahun sebelum", gran: "month" };
}

function buildTrend<T extends { orderedAt: Date; total: number }>(orders: T[], profitFn: (o: T) => number, r: DashRange) {
  const map = new Map<string, { revenue: number; profit: number }>();
  if (r.gran === "hour") {
    for (let h = 0; h < 24; h++) map.set(`${String(h).padStart(2, "0")}:00`, { revenue: 0, profit: 0 });
  } else if (r.gran === "month") {
    for (let m = 0; m < 12; m++) map.set(format(new Date(r.from.getFullYear(), m, 1), "MMM"), { revenue: 0, profit: 0 });
  } else {
    const days = Math.min(differenceInCalendarDays(r.to, r.from) + 1, 92);
    for (let i = 0; i < days; i++) map.set(format(toMytWall(addDays(startOfDay(r.from), i)), "dd/MM"), { revenue: 0, profit: 0 });
  }
  // Label ikut MYT (shift +8 sebab server UTC)
  const keyOf = (dt: Date) => {
    const m = toMytWall(dt);
    return r.gran === "hour" ? format(m, "HH:00") : r.gran === "month" ? format(m, "MMM") : format(m, "dd/MM");
  };
  for (const o of orders) {
    const e = map.get(keyOf(o.orderedAt));
    if (e) {
      e.revenue += o.total;
      e.profit += profitFn(o);
    }
  }
  return Array.from(map.entries()).map(([date, v]) => ({ date, ...v }));
}

export type DashboardData = {
  periodLabel: string;
  deltaLabel: string;
  revenue: number;
  profit: number;
  orders: number;
  aov: number;
  marginPct: number;
  adsSpend: number;
  roas: number | null;
  periodDays: number;
  revenueDeltaPct: number | null;
  profitDeltaPct: number | null;
  ordersDeltaPct: number | null;
  // Alert (keadaan semasa, bukan ikut tempoh)
  pendingAwb: number;
  returnsToHandle: number;
  lowStockCount: number;
  // Breakdown
  byPlatform: { platform: Platform; revenue: number; orders: number; profit: number }[];
  byStore: { store: string; label: string; revenue: number; orders: number; profit: number }[];
  statusCounts: Record<string, number>;
  dailyTrend: { date: string; revenue: number; profit: number }[];
  bestSellers: { name: string; sku: string; quantity: number; revenue: number; profit: number }[];
  recentOrders: {
    id: string;
    platformOrderId: string;
    platform: string;
    buyerName: string | null;
    items: string;
    total: number;
    currency: string;
    status: string;
    deliveryStatus: string;
    orderedAt: Date;
  }[];
};

export async function getDashboardData(r: DashRange): Promise<DashboardData> {
  const feeRates = await getPlatformFees();

  // Abaikan order sebelum kita start ads (DATA_START) — data lama tak dikira.
  const floor = r.from < DATA_START ? DATA_START : r.from;

  const [orders, prevOrders] = await Promise.all([
    db.order.findMany({
      where: { orderedAt: { gte: floor, lte: r.to }, status: { in: ACTIVE_STATUSES } },
      include: { items: { include: { product: true } } },
    }),
    db.order.findMany({
      where: { orderedAt: { gte: r.prevFrom, lte: r.prevTo }, status: { in: ACTIVE_STATUSES } },
      include: { items: { include: { product: true } } },
    }),
  ]);
  toMyr(orders);
  toMyr(prevOrders);
  const feeOf = (o: { platform: string; platformFee: number; total: number }) =>
    o.platformFee > 0 ? o.platformFee : o.total * ((feeRates[o.platform as Platform] ?? 0) / 100);
  const cogsOf = (o: { items: { quantity: number; product: { cogsPerUnit: number } | null }[] }) =>
    o.items.reduce((s, it) => s + (it.product?.cogsPerUnit ?? 0) * it.quantity, 0);
  const profitOf = (o: (typeof orders)[number]) => o.total - feeOf(o) - cogsOf(o) - (o.shippingFee || 0);

  const sumRev = (a: typeof orders) => a.reduce((s, o) => s + o.total, 0);
  const sumProfit = (a: typeof orders) => a.reduce((s, o) => s + profitOf(o), 0);
  const delta = (a: number, b: number) => (b > 0 ? ((a - b) / b) * 100 : a > 0 ? 100 : null);

  const revenue = sumRev(orders);
  const orderCount = orders.length;
  const grossProfit = sumProfit(orders);

  // Tolak kos (iklan/tetap/lain) dalam tempoh → untung BERSIH sebenar
  const periodExpenses = await db.expense.findMany({ where: { date: { gte: floor, lte: r.to } } });
  const totalExpenses = periodExpenses.reduce((s, e) => s + e.amount, 0);
  const profit = grossProfit - totalExpenses;
  const adsSpend = periodExpenses.filter((e) => e.type === "ads").reduce((s, e) => s + e.amount, 0);
  const roas = adsSpend > 0 ? revenue / adsSpend : null;

  const byPlatform = PLATFORMS.map((platform) => {
    const po = orders.filter((o) => o.platform === platform);
    return {
      platform,
      revenue: po.reduce((s, o) => s + o.total, 0),
      orders: po.length,
      profit: po.reduce((s, o) => s + profitOf(o), 0),
    };
  });

  // Pecahan ikut KEDAI (facelim / facelimsg / maxlim / maxlimsg) — semua platform "woocommerce"
  // jadi satu "Website", tapi user nak nampak tiap kedai berasingan.
  const STORE_LABELS: Record<string, string> = {
    facelim: "Facelim MY",
    facelimsg: "Facelim SG",
    maxlim: "Maxlim MY",
    maxlimsg: "Maxlim SG",
  };
  const storeMap = new Map<string, { revenue: number; orders: number; profit: number }>();
  for (const o of orders) {
    const k = o.store || "lain";
    const cur = storeMap.get(k) ?? { revenue: 0, orders: 0, profit: 0 };
    cur.revenue += o.total;
    cur.orders += 1;
    cur.profit += profitOf(o);
    storeMap.set(k, cur);
  }
  const byStore = Array.from(storeMap.entries())
    .map(([store, v]) => ({ store, label: STORE_LABELS[store] ?? store, ...v }))
    .sort((a, b) => b.revenue - a.revenue);

  const dailyTrend = buildTrend(orders, profitOf, r);

  // Best sellers ikut UNTUNG (bukan sekadar revenue)
  const sellerMap = new Map<string, { name: string; sku: string; quantity: number; revenue: number; profit: number }>();
  for (const o of orders) {
    for (const it of o.items) {
      const key = it.sku ?? it.name;
      const cur = sellerMap.get(key) ?? { name: it.name, sku: it.sku ?? "-", quantity: 0, revenue: 0, profit: 0 };
      cur.quantity += it.quantity;
      cur.revenue += it.quantity * it.unitPrice;
      cur.profit += it.quantity * (it.unitPrice - (it.product?.cogsPerUnit ?? 0));
      sellerMap.set(key, cur);
    }
  }
  const bestSellers = Array.from(sellerMap.values()).sort((a, b) => b.profit - a.profit).slice(0, 5);

  // Pipeline status (era-ads sahaja, dari DATA_START) + alert
  const statusGroup = await db.order.groupBy({
    by: ["status"],
    _count: true,
    where: { orderedAt: { gte: DATA_START } },
  });
  const statusCounts: Record<string, number> = {};
  for (const s of statusGroup) statusCounts[s.status] = s._count;

  const returnsToHandle = await db.order.count({
    where: { returnStatus: { in: ["requested", "approved", "returned"] }, orderedAt: { gte: DATA_START } },
  });
  const supplies = await db.supply.findMany({ select: { currentStock: true, reorderLevel: true } });
  const lowStockCount = supplies.filter((s) => s.currentStock <= s.reorderLevel).length;

  // JANGAN toMyr di sini — papar nilai asal order (S$ untuk SG, RM untuk MY).
  const recent = await db.order.findMany({ orderBy: { orderedAt: "desc" }, take: 6, include: { items: true } });
  const recentOrders = recent.map((o) => ({
    id: o.id,
    platformOrderId: o.platformOrderId,
    platform: o.platform,
    buyerName: o.buyerName,
    items: o.items.map((it) => `${it.name} ×${it.quantity}`).join(", "),
    total: o.total,
    currency: /sg/i.test(o.store) ? "SGD" : "MYR",
    status: o.status,
    deliveryStatus: o.deliveryStatus,
    orderedAt: o.orderedAt,
  }));

  return {
    periodLabel: r.label,
    deltaLabel: r.deltaLabel,
    revenue,
    profit,
    orders: orderCount,
    aov: orderCount > 0 ? revenue / orderCount : 0,
    marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
    adsSpend,
    roas,
    periodDays: Math.max(1, differenceInCalendarDays(r.to, floor) + 1),
    revenueDeltaPct: delta(revenue, sumRev(prevOrders)),
    profitDeltaPct: delta(profit, sumProfit(prevOrders)),
    ordersDeltaPct: delta(orderCount, prevOrders.length),
    pendingAwb: statusCounts.pending ?? 0,
    returnsToHandle,
    lowStockCount,
    byPlatform,
    byStore,
    statusCounts,
    dailyTrend,
    bestSellers,
    recentOrders,
  };
}

export type PnlData = {
  revenue: number;
  platformFees: number;
  cogs: number;
  shipping: number;
  adsSpend: number;
  fixedCosts: number;
  otherCosts: number;
  grossProfit: number;
  netProfit: number;
  marginPct: number;
  cogsUnmatchedItems: number;
};

export async function getPnlData(from: Date, to: Date): Promise<PnlData> {
  // Abaikan order sebelum kita start ads (DATA_START).
  const floor = from < DATA_START ? DATA_START : from;
  const orders = await db.order.findMany({
    where: { orderedAt: { gte: floor, lte: to }, status: { in: ACTIVE_STATUSES } },
    include: { items: { include: { product: true } } },
  });
  toMyr(orders);

  const revenue = orders.reduce((s, o) => s + o.total, 0);
  // Fee sebenar dari platform kalau ada; kalau tiada (cth: import CSV), anggar guna fee % setting
  const feeRates = await getPlatformFees();
  const platformFees = orders.reduce(
    (s, o) => s + (o.platformFee > 0 ? o.platformFee : o.total * ((feeRates[o.platform as Platform] ?? 0) / 100)),
    0
  );

  let cogs = 0;
  let cogsUnmatchedItems = 0;
  for (const o of orders) {
    for (const it of o.items) {
      if (it.product) {
        cogs += it.product.cogsPerUnit * it.quantity;
      } else {
        cogsUnmatchedItems++;
      }
    }
  }

  // Kos fulfilment sebenar (NinjaVan + COD + gateway) yang disimpan masa sync
  const shipping = orders.reduce((s, o) => s + (o.shippingFee || 0), 0);

  const expenses = await db.expense.findMany({ where: { date: { gte: from, lte: to } } });
  const adsSpend = expenses.filter((e) => e.type === "ads").reduce((s, e) => s + e.amount, 0);
  const fixedCosts = expenses.filter((e) => e.type === "fixed").reduce((s, e) => s + e.amount, 0);
  const otherCosts = expenses.filter((e) => e.type === "other").reduce((s, e) => s + e.amount, 0);

  const grossProfit = revenue - platformFees - cogs - shipping;
  const netProfit = grossProfit - adsSpend - fixedCosts - otherCosts;

  return {
    revenue,
    platformFees,
    cogs,
    shipping,
    adsSpend,
    fixedCosts,
    otherCosts,
    grossProfit,
    netProfit,
    marginPct: revenue > 0 ? (netProfit / revenue) * 100 : 0,
    cogsUnmatchedItems,
  };
}
