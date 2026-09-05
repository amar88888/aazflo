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
  type Platform,
  type OrderStatus,
} from "@/lib/constants";
import { PageHeader, Card, StatCard, Badge } from "@/components/ui";
import { RevenueProfitChart, PlatformRevenueChart } from "@/components/charts";
import { PlatformBadge } from "@/components/platform-icon";
import { Wallet, TrendingUp, ShoppingBag, Percent, Printer, RotateCcw, PackageOpen } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

const STATUS_DOT: Record<string, string> = {
  pending: "bg-red-500",
  printed: "bg-blue-500",
  shipped: "bg-orange-500",
  completed: "bg-emerald-500",
  cancelled: "bg-slate-400",
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
          <div className="flex flex-wrap items-center justify-end gap-2">
            <div className="flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
              {DASHBOARD_PERIODS.map((p) => (
                <Link
                  key={p.key}
                  href={`/dashboard?p=${p.key}`}
                  className={`rounded-md px-2.5 py-1.5 font-medium transition-colors ${
                    !activeCustom && activePreset === p.key ? "bg-violet-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
          label={`Order (${d.periodLabel})`}
          value={String(d.orders)}
          icon={ShoppingBag}
          tone="cyan"
          delta={d.ordersDeltaPct}
          deltaLabel={d.deltaLabel}
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

      {/* Alert strip — actionable */}
      {alerts.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          {alerts.map((a, i) => {
            const Icon = a.icon;
            const cls: Record<string, string> = {
              orange: "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100",
              red: "border-red-300 bg-red-50 text-red-700 hover:bg-red-100",
              amber: "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100",
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
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full ${STATUS_DOT[s] ?? "bg-slate-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
            {d.returnsToHandle > 0 && (
              <div className="mt-3 flex items-center justify-between rounded-lg bg-red-50 px-3 py-2 text-sm">
                <span className="flex items-center gap-2 text-red-700">
                  <RotateCcw size={14} /> Return perlu urus
                </span>
                <span className="font-semibold text-red-700">{d.returnsToHandle}</span>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Platform profit + Best sellers by profit */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Untung Ikut Platform</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2">Platform</th>
                <th className="pb-2 text-right">Order</th>
                <th className="pb-2 text-right">Revenue</th>
                <th className="pb-2 text-right">Untung</th>
              </tr>
            </thead>
            <tbody>
              {d.byPlatform.map((p) => (
                <tr key={p.platform} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5">
                    <PlatformBadge platform={p.platform as Platform} size={16} />
                  </td>
                  <td className="py-2.5 text-right">{p.orders}</td>
                  <td className="py-2.5 text-right">{formatRM(p.revenue)}</td>
                  <td className="py-2.5 text-right font-semibold text-emerald-600">{formatRM(p.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Produk Paling Untung (Top 5)</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2">Produk</th>
                <th className="pb-2 text-right">Unit</th>
                <th className="pb-2 text-right">Untung</th>
              </tr>
            </thead>
            <tbody>
              {d.bestSellers.map((p) => (
                <tr key={p.sku} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5">
                    <p className="font-medium text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-400">{p.sku}</p>
                  </td>
                  <td className="py-2.5 text-right">{p.quantity}</td>
                  <td className="py-2.5 text-right font-semibold text-emerald-600">{formatRM(p.profit)}</td>
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
          <table className="w-full text-sm">
            <tbody>
              {d.recentOrders.map((o) => (
                <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-slate-800">{o.platformOrderId}</p>
                    <p className="text-xs text-slate-400">{o.buyerName ?? "-"}</p>
                  </td>
                  <td className="px-5 py-3">
                    <PlatformBadge platform={o.platform as Platform} size={16} />
                  </td>
                  <td className="px-5 py-3 text-right font-medium">{formatRM(o.total)}</td>
                  <td className="px-5 py-3">
                    <Badge color={o.status === "completed" ? "green" : o.status === "pending" ? "red" : "blue"}>
                      {ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status}
                    </Badge>
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
        </Card>
      </div>
    </div>
  );
}
