import {
  getDashboardData,
  resolvePeriodRange,
  resolveCustomRange,
  DASHBOARD_PERIODS,
  type DashboardPeriod,
} from "@/lib/queries";
import { PeriodPicker } from "./period-picker";
import { formatRM, formatPercent, formatDateTime } from "@/lib/format";
import { ORDER_STATUSES, ORDER_STATUS_LABELS, PROFIT_TARGET, type OrderStatus } from "@/lib/constants";
import { PageHeader, Card, Badge } from "@/components/ui";
import { RevenueProfitChart } from "@/components/charts";
import { Printer, RotateCcw, PackageOpen } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

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

// RM tanpa sen — untuk angka besar di kad (muat 2 lajur di telefon)
const rm0 = (v: number) => `${v < 0 ? "-" : ""}RM ${Math.abs(v).toLocaleString("en-MY", { maximumFractionDigits: 0 })}`;
const pctOf = (v: number, total: number) => (total > 0 ? (v / total) * 100 : 0);

function Delta({ v, label }: { v: number | null; label: string }) {
  if (v == null) return null;
  return (
    <p className={`mt-1 text-xs font-medium ${v >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
      {v >= 0 ? "▲" : "▼"} {Math.abs(v).toFixed(0)}% <span className="t-sub font-normal">{label}</span>
    </p>
  );
}

// Kad KPI padat — susunan ikut aliran duit: Sales → Iklan → Nett Sales → Profit Bersih
function Kpi({
  step,
  label,
  value,
  tone = "text-white",
  highlight,
  children,
}: {
  step: string;
  label: string;
  value: string;
  tone?: string;
  highlight?: "green" | "red";
  children?: ReactNode;
}) {
  const ring =
    highlight === "green" ? "ring-1 ring-emerald-400/40" : highlight === "red" ? "ring-1 ring-rose-400/40" : "";
  return (
    <div className={`stat-card relative overflow-hidden rounded-2xl p-4 sm:p-5 ${ring}`}>
      <p className="t-label flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider">
        <span className="text-slate-500">{step}</span>
        {label}
      </p>
      <p className={`stat-value mt-1.5 text-xl font-bold tracking-tight tabular-nums sm:text-2xl ${tone}`}>{value}</p>
      {children}
    </div>
  );
}

function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold text-slate-700">{children}</h2>
      {right && <div className="text-xs text-slate-400">{right}</div>}
    </div>
  );
}

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

  const payTotal = d.onlinePaid.orders + d.cod.orders;
  const onlinePct = pctOf(d.onlinePaid.orders, payTotal);
  const profitTone = d.profit >= 0 ? "text-emerald-300" : "text-rose-300";

  // Target untung (ikut bilangan hari dalam tempoh)
  const tFloor = PROFIT_TARGET.floor * d.periodDays;
  const tGoal = PROFIT_TARGET.goal * d.periodDays;
  const tPct = Math.max(0, Math.min(100, (d.profit / tGoal) * 100));
  const floorMark = (tFloor / tGoal) * 100;
  const hit = d.profit >= tGoal ? "goal" : d.profit >= tFloor ? "floor" : "below";

  // Ke mana duit pergi (dari Sales)
  const flow = [
    { label: "Sales", v: d.revenue, sign: "", cls: "text-white" },
    { label: "Duit iklan", v: d.adsSpend, sign: "−", cls: "text-rose-300" },
    { label: "Kos produk", v: d.cogsTotal, sign: "−", cls: "text-rose-300" },
    { label: "Shipping & fee", v: d.shipFeeTotal, sign: "−", cls: "text-rose-300" },
    ...(d.otherExpenses > 0.5 ? [{ label: "Kos lain", v: d.otherExpenses, sign: "−", cls: "text-rose-300" }] : []),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        subtitle={`${d.periodLabel} · ${d.orders} order · AOV ${formatRM(d.aov)}`}
        action={
          <div className="flex flex-col gap-2 sm:items-end">
            <div className="grid grid-cols-3 gap-1 rounded-lg border border-white/10 bg-white/5 p-0.5 text-sm backdrop-blur sm:flex">
              {DASHBOARD_PERIODS.map((p) => (
                <Link
                  key={p.key}
                  href={`/dashboard?p=${p.key}`}
                  className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-center font-medium transition-colors ${
                    !activeCustom && activePreset === p.key ? "text-white" : "text-slate-300 hover:bg-white/10"
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

      {/* 1) Aliran duit: Sales → Iklan → Nett Sales → Profit Bersih */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi step="1" label="Sales" value={rm0(d.revenue)}>
          <Delta v={d.revenueDeltaPct} label={d.deltaLabel} />
        </Kpi>
        <Kpi step="2" label="Duit Iklan" value={rm0(d.adsSpend)} tone="text-rose-200">
          <p className={`mt-1 text-xs font-medium ${d.roas !== null && d.roas < 1.65 ? "text-rose-300" : "text-emerald-300"}`}>
            {d.roas !== null ? `ROAS ${d.roas.toFixed(2)}×` : "Tiada belanja"}
          </p>
        </Kpi>
        <Kpi step="3" label="Nett Sales" value={rm0(d.nettSales)}>
          <p className="t-sub mt-1 text-xs">Sales tolak iklan</p>
        </Kpi>
        <Kpi step="4" label="Profit Bersih" value={rm0(d.profit)} tone={profitTone} highlight={d.profit >= 0 ? "green" : "red"}>
          <Delta v={d.profitDeltaPct} label={d.deltaLabel} />
          <p className="t-sub text-xs">Margin {formatPercent(d.marginPct)}</p>
        </Kpi>
      </div>

      {/* 2) Cara bayar + Target */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle right={`${payTotal} order`}>💳 Cara Bayar</SectionTitle>
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-emerald-400" style={{ width: `${onlinePct}%` }} />
            <div className="h-full bg-amber-400" style={{ width: `${payTotal ? 100 - onlinePct : 0}%` }} />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-400" /> Online
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-white">{rm0(d.onlinePaid.revenue)}</p>
              <p className="t-sub text-xs">
                {d.onlinePaid.orders} order · {formatPercent(onlinePct)}
              </p>
              <p className="t-sub text-[11px]">Duit dah masuk</p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-300">
                <span className="h-2 w-2 rounded-full bg-amber-400" /> COD
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-white">{rm0(d.cod.revenue)}</p>
              <p className="t-sub text-xs">
                {d.cod.orders} order · {formatPercent(payTotal ? 100 - onlinePct : 0)}
              </p>
              <p className="t-sub text-[11px]">Kutip masa hantar</p>
            </div>
          </div>
          {d.payUnknown > 0 && (
            <p className="mt-3 text-[11px] text-slate-500">{d.payUnknown} order belum ada data bayaran (terisi lepas sync Woo).</p>
          )}
        </Card>

        <Card>
          <SectionTitle right={`min ${rm0(tFloor)} · sasaran ${rm0(tGoal)}`}>🎯 Target Untung</SectionTitle>
          <p className={`text-2xl font-bold tabular-nums ${hit === "below" ? "text-rose-300" : "text-emerald-300"}`}>
            {rm0(d.profit)} <span className="text-sm font-medium text-slate-400">/ {rm0(tGoal)}</span>
          </p>
          <div className="relative mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full ${hit === "below" ? "bg-rose-500" : hit === "floor" ? "bg-amber-400" : "bg-emerald-500"}`}
              style={{ width: `${tPct}%` }}
            />
            <div className="absolute top-0 h-full w-0.5 bg-white/70" style={{ left: `${floorMark}%` }} />
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {hit === "goal"
              ? "🏆 Sasaran tercapai."
              : hit === "floor"
                ? `✅ Lepas minimum. ${rm0(tGoal - d.profit)} lagi ke sasaran.`
                : `${rm0(tFloor - d.profit)} lagi ke minimum ${rm0(tFloor)}.`}
          </p>
        </Card>
      </div>

      {/* 3) Ke mana duit pergi + Trend */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <SectionTitle>Ke Mana Duit Pergi</SectionTitle>
          <div className="space-y-2.5">
            {flow.map((f) => (
              <div key={f.label}>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">
                    {f.sign && <span className="mr-1 text-slate-500">{f.sign}</span>}
                    {f.label}
                  </span>
                  <span className={`tabular-nums font-medium ${f.cls}`}>
                    {formatRM(f.v)} <span className="text-xs text-slate-500">{formatPercent(pctOf(f.v, d.revenue))}</span>
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className={`h-full rounded-full ${f.sign ? "bg-rose-400/70" : "bg-slate-300"}`}
                    style={{ width: `${Math.min(100, pctOf(f.v, d.revenue))}%` }}
                  />
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between border-t border-white/10 pt-2.5 text-sm">
              <span className="font-semibold text-slate-700">= Profit Bersih</span>
              <span className={`tabular-nums font-bold ${profitTone}`}>
                {formatRM(d.profit)} <span className="text-xs text-slate-500">{formatPercent(d.marginPct)}</span>
              </span>
            </div>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <SectionTitle>Trend Sales & Untung Kasar</SectionTitle>
          <RevenueProfitChart data={d.dailyTrend} />
        </Card>
      </div>

      {/* 4) Ikut kedai + Produk */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <SectionTitle>Untung Ikut Kedai</SectionTitle>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2">Kedai</th>
                <th className="pb-2 pl-3 text-right">Order</th>
                <th className="pb-2 pl-3 text-right">Sales</th>
                <th className="pb-2 pl-3 text-right">Profit</th>
              </tr>
            </thead>
            <tbody>
              {d.byStore.map((s) => (
                <tr key={s.store} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5 pr-2">
                    <p className="font-medium text-slate-800">{s.label}</p>
                    {s.adsSpend > 0 && <p className="text-xs text-slate-400">iklan {rm0(s.adsSpend)}</p>}
                  </td>
                  <td className="py-2.5 pl-3 text-right tabular-nums">{s.orders}</td>
                  <td className="whitespace-nowrap py-2.5 pl-3 text-right tabular-nums">{rm0(s.revenue)}</td>
                  <td
                    className={`whitespace-nowrap py-2.5 pl-3 text-right font-semibold tabular-nums ${s.netProfit >= 0 ? "text-emerald-500" : "text-rose-400"}`}
                  >
                    {rm0(s.netProfit)}
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
          <SectionTitle>Produk Paling Untung</SectionTitle>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="pb-2">Produk</th>
                <th className="pb-2 pl-3 text-right">Unit</th>
                <th className="pb-2 pl-3 text-right">Untung kasar</th>
              </tr>
            </thead>
            <tbody>
              {d.bestSellers.map((p) => (
                <tr key={p.sku} className="border-b border-slate-100 last:border-0">
                  <td className="py-2.5 pr-2 font-medium text-slate-800">{p.name}</td>
                  <td className="py-2.5 pl-3 text-right tabular-nums">{p.quantity}</td>
                  <td className="whitespace-nowrap py-2.5 pl-3 text-right font-semibold tabular-nums text-emerald-500">{rm0(p.profit)}</td>
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

      {/* 5) Customer bayar online + Order terkini */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="!p-0">
          <div className="border-b border-slate-200 px-5 py-4">
            <SectionTitle right={`${d.onlinePaid.orders} order`}>Customer Dah Bayar Online</SectionTitle>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {d.onlinePaidList.slice(0, 8).map((o) => (
                <tr key={o.id} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-slate-800">{o.buyerName ?? "-"}</p>
                    <p className="text-xs text-slate-400">
                      #{o.platformOrderId} · {o.method}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right">
                    <p className="font-semibold tabular-nums text-emerald-500">{formatRM(o.total)}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(o.paidAt)}</p>
                  </td>
                </tr>
              ))}
              {d.onlinePaidList.length === 0 && (
                <tr>
                  <td className="px-5 py-6 text-center text-slate-400">Belum ada bayaran online</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <Card className="!p-0">
          <div className="border-b border-slate-200 px-5 py-4">
            <SectionTitle
              right={
                <Link href="/orders" className="font-medium text-violet-400 hover:underline">
                  Lihat semua →
                </Link>
              }
            >
              Order Terkini
            </SectionTitle>
          </div>
          <table className="w-full text-sm">
            <tbody>
              {d.recentOrders.map((o) => (
                <tr key={o.id} className="border-b border-white/5 last:border-0">
                  <td className="px-5 py-2.5">
                    <p className="font-medium text-slate-800">{o.buyerName ?? "-"}</p>
                    <p className="text-xs text-slate-400">
                      #{o.platformOrderId} · {formatDateTime(o.orderedAt)}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-right">
                    <p className="font-semibold tabular-nums text-slate-800">
                      {o.currency === "SGD" ? `S$${o.total.toFixed(2)}` : formatRM(o.total)}
                    </p>
                    <div className="mt-0.5 flex justify-end gap-1">
                      {o.payment === "online" && <Badge color="green">Online</Badge>}
                      {o.payment === "cod" && <Badge color="orange">COD</Badge>}
                      <Badge color={o.status === "completed" ? "green" : o.status === "pending" ? "red" : "blue"}>
                        {ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status}
                      </Badge>
                    </div>
                  </td>
                </tr>
              ))}
              {d.recentOrders.length === 0 && (
                <tr>
                  <td className="px-5 py-6 text-center text-slate-400">Belum ada order</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {/* 6) Operasi: amaran + pipeline */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle>Pipeline Order</SectionTitle>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
            {ORDER_STATUSES.map((s) => {
              const count = d.statusCounts[s] ?? 0;
              const total = Object.values(d.statusCounts).reduce((a, b) => a + b, 0) || 1;
              return (
                <div key={s}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-slate-600">
                      <span className={`h-2 w-2 rounded-full ${STATUS_DOT[s] ?? "bg-slate-400"}`} />
                      {ORDER_STATUS_LABELS[s]}
                    </span>
                    <span className="font-semibold tabular-nums text-slate-800">{count}</span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full rounded-full ${STATUS_DOT[s] ?? "bg-slate-400"}`} style={{ width: `${(count / total) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
        <Card>
          <SectionTitle>Perlu Tindakan</SectionTitle>
          {alerts.length > 0 ? (
            <div className="space-y-2">
              {alerts.map((a, i) => {
                const Icon = a.icon;
                const cls: Record<string, string> = {
                  orange: "border-orange-400/30 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20",
                  red: "border-rose-400/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20",
                  amber: "border-amber-400/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20",
                };
                return (
                  <Link key={i} href={a.href} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${cls[a.color]}`}>
                    <Icon size={15} /> {a.text}
                  </Link>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-400">✅ Semua beres.</p>
          )}
        </Card>
      </div>

      <p className="pb-2 text-center text-[11px] text-slate-500">
        Angka sebenar dari order Woo. Meta Ads Manager tunjuk lebih (attribution) — untuk untung, percaya sini.
      </p>
    </div>
  );
}
