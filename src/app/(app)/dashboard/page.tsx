import {
  getDashboardData,
  resolvePeriodRange,
  resolveCustomRange,
  DASHBOARD_PERIODS,
  type DashboardPeriod,
} from "@/lib/queries";
import { PeriodPicker } from "./period-picker";
import { formatRM, formatPercent, formatDateTime } from "@/lib/format";
import {
  PLATFORM_LABELS,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  PROFIT_TARGET,
  type Platform,
  type OrderStatus,
} from "@/lib/constants";
import { PageHeader, Card, StatCard, Badge } from "@/components/ui";
import { RevenueProfitChart, PlatformRevenueChart } from "@/components/charts";
import { PlatformBadge } from "@/components/platform-icon";
import { Wallet, TrendingUp, ShoppingBag, Percent, Printer, RotateCcw, PackageOpen, Megaphone, CreditCard } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

// Palet "mewah": platinum menaik untuk in-progress, hijau (good), fade (batal)
const STATUS_DOT: Record<string, string> = {
  unpaid: "bg-slate-700",
  pending: "bg-slate-500",
  printed: "bg-slate-400",
  shipped: "bg-slate-300",
  completed: "bg-emerald-400",
  cancelled: "bg-slate-700",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; date?: string; month?: string; year?: string }>;
}) {
  const params = await searchParams;
  const now = new Date();

  // Custom (tarikh/bulan/tahun tertentu) ambil keutamaan; kalau tiada, guna preset.
  let range = null;
  let activeCustom: { kind: "date" | "month" | "year"; value: string } | null = null;
  if (params.date) {
    range = resolveCustomRange("date", params.date, now);
    if (range) activeCustom = { kind: "date", value: params.date };
  } else if (params.month) {
    range = resolveCustomRange("month", params.month, now);
    if (range) activeCustom = { kind: "month", value: params.month };
  } else if (params.year) {
    range = resolveCustomRange("year", params.year, now);
    if (range) activeCustom = { kind: "year", value: params.year };
  }
  const activePreset = (DASHBOARD_PERIODS.find((x) => x.key === params.p)?.key ?? "30d") as DashboardPeriod;
  if (!range) range = resolvePeriodRange(activePreset, now);
  const d = await getDashboardData(range);

  const alerts = [
    d.pendingAwb > 0 && { href: "/orders?status=pending", icon: Printer, color: "orange", text: `${d.pendingAwb} AWB belum print` },
    d.returnsToHandle > 0 && { href: "/orders", icon: RotateCcw, color: "red", text: `${d.returnsToHandle} return perlu urus` },
    d.lowStockCount > 0 && { href: "/ops", icon: PackageOpen, color: "amber", text: `${d.lowStockCount} barang stok rendah` },
  ].filter(Boolean) as { href: string; icon: typeof Printer; color: string; text: string }[];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={`${d.periodLabel} — Revenue ${formatRM(d.revenue)} · AOV ${formatRM(d.aov)}`}
        action={
          <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
            <div className="flex flex-wrap gap-1 rounded-lg border border-white/10 bg-white/5 p-0.5 text-sm backdrop-blur">
              {DASHBOARD_PERIODS.map((p) => (
                <Link
                  key={p.key}
                  href={`/dashboard?p=${p.key}`}
                  className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                    !activeCustom && activePreset === p.key
                      ? "text-white"
                      : "text-slate-300 hover:bg-white/10"
                  }`}
                  style={!activeCustom && activePreset === p.key ? { background: "rgb(var(--m2-rgb))" } : undefined}
                >
                  {p.label}
                </Link>
              ))}
            </div>
            <PeriodPicker active={activeCustom} />
          </div>
        }
      />

      {/* KPI ikut tempoh dipilih, banding tempoh sebelum */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label={`Revenue (${d.periodLabel})`}
          value={formatRM(d.revenue)}
          icon={Wallet}
          tone="violet"
          delta={d.revenueDeltaPct}
          deltaLabel={d.deltaLabel}
        />
        <StatCard
          label={`Untung Bersih (${d.periodLabel})`}
          value={formatRM(d.profit)}
          icon={TrendingUp}
          tone="emerald"
          accent={d.profit >= 0 ? "green" : "red"}
          delta={d.profitDeltaPct}
          deltaLabel={d.deltaLabel}
        />
        <StatCard
          label={`Belanja Iklan (${d.periodLabel})`}
          value={formatRM(d.adsSpend)}
          sub={d.roas !== null ? `ROAS ${d.roas.toFixed(2)}×` : "Tiada belanja"}
          icon={Megaphone}
          tone="amber"
          accent={d.roas !== null && d.roas < 1.65 ? "red" : "green"}
        />
        <StatCard
          label={`Order (${d.periodLabel})`}
          value={String(d.orders)}
          icon={ShoppingBag}
          tone="cyan"
          delta={d.ordersDeltaPct}
          deltaLabel={d.deltaLabel}
        />
        <StatCard
          label={`Dah Bayar Online (${d.periodLabel})`}
          value={formatRM(d.onlinePaid.revenue)}
          sub={`${d.onlinePaid.orders} order · COD ${d.cod.orders} (${formatRM(d.cod.revenue)})`}
          icon={CreditCard}
          tone="emerald"
          accent="green"
        />
        <StatCard
          label="Margin Untung"
          value={formatPercent(d.marginPct)}
          sub={`AOV ${formatRM(d.aov)}`}
          icon={Percent}
          tone="amber"
          accent={d.marginPct >= 0 ? "green" : "red"}
        />
      </div>

      {/* 🎯 Target untung — kejar sasaran harian */}
      {(() => {
        const tFloor = PROFIT_TARGET.floor * d.periodDays;
        const tGoal = PROFIT_TARGET.goal * d.periodDays;
        const pct = Math.max(0, Math.min(100, (d.profit / tGoal) * 100));
        const floorMark = (tFloor / tGoal) * 100;
        const hit = d.profit >= tGoal ? "goal" : d.profit >= tFloor ? "floor" : "below";
        const barCol = hit === "below" ? "bg-rose-500" : hit === "floor" ? "bg-amber-400" : "bg-emerald-500";
        return (
          <Card className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">🎯 Target Untung ({d.periodLabel})</h2>
              <span className={`text-sm font-bold ${hit === "below" ? "text-rose-400" : "text-emerald-400"}`}>
                {formatRM(d.profit)} / {formatRM(tGoal)}
              </span>
            </div>
            <div className="relative h-3 w-full overflow-hidden rounded-full bg-white/10">
              <div className={`h-full rounded-full ${barCol}`} style={{ width: `${pct}%` }} />
              <div className="absolute top-0 h-full w-0.5 bg-white/70" style={{ left: `${floorMark}%` }} />
            </div>
            <p className="mt-2 text-xs text-slate-400">
              {hit === "goal"
                ? "🏆 Target tercapai! Terbaik bro!"
                : hit === "floor"
                  ? `✅ Dah lepas minimum. ${formatRM(tGoal - d.profit)} lagi untuk cecah sasaran ${formatRM(tGoal)}.`
                  : `🔴 ${formatRM(tFloor - d.profit)} lagi untuk cecah minimum ${formatRM(tFloor)}.`}{" "}
              <span className="text-slate-500">(garis putih = minimum {formatRM(tFloor)})</span>
            </p>
          </Card>
        );
      })()}

      {/* 💳 Customer dah bayar online — duit dah masuk, tak risiko COD tolak */}
      <Card className="mt-4 !p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-700">💳 Customer Dah Bayar Online ({d.periodLabel})</h2>
          <span className="text-xs text-slate-400">
            {d.onlinePaid.orders} online · {d.cod.orders} COD
            {d.onlinePaid.orders + d.cod.orders > 0 &&
              ` · ${formatPercent((d.onlinePaid.orders / (d.onlinePaid.orders + d.cod.orders)) * 100)} online`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {d.onlinePaidList.map((o) => (
                <tr key={o.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">{o.buyerName ?? "-"}</p>
                    <p className="text-xs text-slate-400">
                      #{o.platformOrderId} · {o.store}
                    </p>
                  </td>
                  <td className="px-5 py-3">
                    <Badge color="green">{o.method}</Badge>
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right font-semibold tabular-nums text-emerald-500">
                    {formatRM(o.total)}
                  </td>
                  <td className="whitespace-nowrap px-5 py-3 text-right text-xs text-slate-500">{formatDateTime(o.paidAt)}</td>
                </tr>
              ))}
              {d.onlinePaidList.length === 0 && (
                <tr>
                  <td className="px-5 py-6 text-center text-slate-400">Belum ada bayaran online dalam tempoh ni</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {d.payUnknown > 0 && (
          <p className="border-t border-slate-200 px-5 py-2 text-xs text-slate-500">
            {d.payUnknown} order belum ada data bayaran — akan terisi selepas sync Woo seterusnya.
          </p>
        )}
      </Card>

      {/* Nota: Aazflo = angka sebenar (order Woo). Meta Ads Manager tunjuk lebih (attribution). */}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400" />
        Angka ni <b className="font-semibold text-slate-300">SEBENAR</b> dari order Woo. Meta Ads Manager akan tunjuk lebih (attribution) — untuk untung, percaya sini.
      </p>

      {/* Alert strip — actionable */}
      {alerts.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          {alerts.map((a, i) => {
            const Icon = a.icon;
            const cls: Record<string, string> = {
              orange: "border-orange-400/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20",
              red: "border-rose-400/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20",
              amber: "border-amber-400/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20",
            };
            return (
              <Link key={i} href={a.href} className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium ${cls[a.color]}`}>
                <Icon size={15} /> {a.text}
              </Link>
            );
          })}
        </div>
      )}

      {/* Trend + Pipeline */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Revenue vs Untung Bersih (harian)</h2>
          <RevenueProfitChart data={d.dailyTrend} />
        </Card>
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Pipeline Order</h2>
          <div className="space-y-2.5">
            {ORDER_STATUSES.map((s) => {
              const count = d.statusCounts[s] ?? 0;
              const total = Object.values(d.statusCounts).reduce((a, b) => a + b, 0) || 1;
              const pct = (count / total) * 100;
              return (
                <div key={s}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[s] ?? "bg-slate-400"}`} />
                      {ORDER_STATUS_LABELS[s]}
                    </span>
                    <span className="font-semibold text-slate-800">{count}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${STATUS_DOT[s] ?? "bg-slate-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {d.returnsToHandle > 0 && (
              <div className="mt-3 flex items-center justify-between rounded-lg bg-rose-500/10 ring-1 ring-rose-400/20 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-rose-300">
                  <RotateCcw size={14} /> Return perlu urus
                </span>
                <span className="font-semibold text-rose-300">{d.returnsToHandle}</span>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Platform profit + Best sellers by profit */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Order &amp; Untung Ikut Kedai</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2">Kedai</th>
                <th className="pb-2 pl-3 text-right">Order</th>
                <th className="pb-2 pl-3 text-right">Revenue</th>
                <th className="pb-2 pl-4 text-right">Untung bersih</th>
              </tr>
            </thead>
            <tbody>
              {d.byStore.map((s) => (
                <tr key={s.store} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5 pr-2">
                    <p className="font-medium text-slate-800">{s.label}</p>
                    {s.adsSpend > 0 && <p className="text-xs text-slate-400">− iklan {formatRM(s.adsSpend)}</p>}
                  </td>
                  <td className="py-2.5 pl-3 text-right font-semibold tabular-nums">{s.orders}</td>
                  <td className="whitespace-nowrap py-2.5 pl-3 text-right tabular-nums">{formatRM(s.revenue)}</td>
                  <td
                    className={`whitespace-nowrap py-2.5 pl-4 text-right font-semibold tabular-nums ${s.netProfit >= 0 ? "text-emerald-600" : "text-rose-500"}`}
                  >
                    {formatRM(s.netProfit)}
                  </td>
                </tr>
              ))}
              {d.byStore.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-400">Belum ada order</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Produk Paling Untung (Top 5)</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2">Produk</th>
                <th className="pb-2 pl-3 text-right">Unit</th>
                <th className="pb-2 pl-4 text-right">Untung</th>
              </tr>
            </thead>
            <tbody>
              {d.bestSellers.map((p) => (
                <tr key={p.sku} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5 pr-2">
                    <p className="font-medium text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.sku}</p>
                  </td>
                  <td className="py-2.5 pl-3 text-right tabular-nums">{p.quantity}</td>
                  <td className="whitespace-nowrap py-2.5 pl-4 text-right font-semibold tabular-nums text-emerald-600">
                    {formatRM(p.profit)}
                  </td>
                </tr>
              ))}
              {d.bestSellers.length === 0 && (
                <tr>
                  <td colSpan={3} className="py-6 text-center text-slate-400">Belum ada data jualan</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Revenue per platform + Recent orders */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Revenue Per Platform</h2>
          <PlatformRevenueChart data={d.byPlatform} />
        </Card>
        <Card className="lg:col-span-2 !p-0">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-sm font-semibold text-slate-700">Order Terkini</h2>
            <Link href="/orders" className="text-xs font-medium text-violet-600 hover:underline">
              Lihat semua →
            </Link>
          </div>
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <tbody>
              {d.recentOrders.map((o) => (
                <tr key={o.id} className="border-b border-white/5 last:border-0 hover:bg-white/5">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">{o.platformOrderId}</p>
                    <p className="text-xs text-slate-400">{o.buyerName ?? "-"}</p>
                  </td>
                  <td className="px-5 py-3">
                    <PlatformBadge platform={o.platform as Platform} size={16} />
                  </td>
                  <td className="px-5 py-3 text-right font-medium">
                    {o.currency === "SGD" ? `S$${o.total.toFixed(2)}` : formatRM(o.total)}
                  </td>
                  <td className="px-5 py-3">
                    <Badge color={o.status === "completed" ? "green" : o.status === "pending" ? "red" : "blue"}>
                      {ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status}
                    </Badge>
                  </td>
                  <td className="px-5 py-3">
                    {o.payment === "online" && <Badge color="green">Online ✓</Badge>}
                    {o.payment === "cod" && <Badge color="orange">COD</Badge>}
                  </td>
                  <td className="px-5 py-3 text-right text-xs text-slate-500">{formatDateTime(o.orderedAt)}</td>
                </tr>
              ))}
              {d.recentOrders.length === 0 && (
                <tr>
                  <td className="px-5 py-8 text-center text-slate-400">Belum ada order</td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
