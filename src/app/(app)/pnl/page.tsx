import { db } from "@/lib/db";
import { getPnlData } from "@/lib/queries";
import { formatRM, formatDate, formatPercent } from "@/lib/format";
import { EXPENSE_TYPE_LABELS, PLATFORM_LABELS, type ExpenseType, type Platform } from "@/lib/constants";
import { PageHeader, Card, StatCard, Badge } from "@/components/ui";
import { addExpenseAction, deleteExpenseAction } from "./actions";
import { startOfMonth, endOfMonth, format } from "date-fns";
import Link from "next/link";
import { Trash2, Wallet, TrendingUp, Banknote, Percent } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function PnlPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  // month format: yyyy-MM, default bulan semasa
  const base = params.month ? new Date(`${params.month}-01T00:00:00`) : new Date();
  const from = startOfMonth(base);
  const to = endOfMonth(base);

  const pnl = await getPnlData(from, to);
  const expenses = await db.expense.findMany({
    where: { date: { gte: from, lte: to } },
    orderBy: { date: "desc" },
  });

  const monthLabel = format(from, "MMMM yyyy");
  const prevMonth = format(new Date(from.getFullYear(), from.getMonth() - 1, 1), "yyyy-MM");
  const nextMonth = format(new Date(from.getFullYear(), from.getMonth() + 1, 1), "yyyy-MM");

  return (
    <div>
      <PageHeader
        title="Profit & Loss"
        subtitle={`Bulan: ${monthLabel}`}
        action={
          <div className="flex gap-2 text-sm">
            <Link href={`/pnl?month=${prevMonth}`} className="btn-secondary rounded-lg px-3 py-1.5">
              ← Bulan lepas
            </Link>
            <Link href={`/pnl?month=${nextMonth}`} className="btn-secondary rounded-lg px-3 py-1.5">
              Bulan depan →
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Revenue" value={formatRM(pnl.revenue)} icon={Wallet} tone="violet" />
        <StatCard label="Gross Profit" value={formatRM(pnl.grossProfit)} sub="Revenue − fee platform − COGS" accent={pnl.grossProfit >= 0 ? "green" : "red"} icon={TrendingUp} tone="emerald" />
        <StatCard label="Net Profit" value={formatRM(pnl.netProfit)} sub="Selepas semua kos" accent={pnl.netProfit >= 0 ? "green" : "red"} icon={Banknote} tone="emerald" />
        <StatCard label="Margin" value={formatPercent(pnl.marginPct)} accent={pnl.marginPct >= 0 ? "green" : "red"} icon={Percent} tone="cyan" />
      </div>

      {pnl.cogsUnmatchedItems > 0 && (
        <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠ {pnl.cogsUnmatchedItems} item order tak dapat dipadankan dengan produk — COGS untuk item ni tak dikira.{" "}
          <Link href="/products" className="font-medium underline">
            Setup SKU produk di sini
          </Link>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Penyata P&L */}
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Penyata {monthLabel}</h2>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-slate-100">
                <td className="py-2.5 text-slate-600">Revenue</td>
                <td className="py-2.5 text-right font-medium">{formatRM(pnl.revenue)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2.5 text-slate-600">(−) Fee platform</td>
                <td className="py-2.5 text-right text-red-600">−{formatRM(pnl.platformFees)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2.5 text-slate-600">(−) COGS (modal produk)</td>
                <td className="py-2.5 text-right text-red-600">−{formatRM(pnl.cogs)}</td>
              </tr>
              <tr className="border-b border-slate-200 bg-slate-50">
                <td className="py-2.5 font-semibold">Gross Profit</td>
                <td className="py-2.5 text-right font-semibold">{formatRM(pnl.grossProfit)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2.5 text-slate-600">(−) Iklan/Ads</td>
                <td className="py-2.5 text-right text-red-600">−{formatRM(pnl.adsSpend)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2.5 text-slate-600">(−) Kos tetap</td>
                <td className="py-2.5 text-right text-red-600">−{formatRM(pnl.fixedCosts)}</td>
              </tr>
              <tr className="border-b border-slate-100">
                <td className="py-2.5 text-slate-600">(−) Lain-lain</td>
                <td className="py-2.5 text-right text-red-600">−{formatRM(pnl.otherCosts)}</td>
              </tr>
              <tr className="btn-primary text-white">
                <td className="rounded-l-lg px-2 py-3 font-semibold">NET PROFIT</td>
                <td className="rounded-r-lg px-2 py-3 text-right font-semibold">{formatRM(pnl.netProfit)}</td>
              </tr>
            </tbody>
          </table>
        </Card>

        {/* Borang tambah kos */}
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Rekod Kos Baru</h2>
          <form action={addExpenseAction} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Jenis</label>
                <select name="type" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {Object.entries(EXPENSE_TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Platform (optional)</label>
                <select name="platform" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  <option value="">Umum</option>
                  {Object.entries(PLATFORM_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Keterangan</label>
              <input name="label" required placeholder="cth: TikTok Ads Julai" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Amaun (RM)</label>
                <input name="amount" type="number" step="0.01" min="0.01" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Tarikh</label>
                <input name="date" type="date" required defaultValue={format(new Date(), "yyyy-MM-dd")} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input type="checkbox" name="recurring" className="rounded" />
              Kos tetap berulang setiap bulan
            </label>
            <button type="submit" className="rounded-lg btn-primary px-5 py-2 text-sm font-medium">
              Simpan Kos
            </button>
          </form>
        </Card>
      </div>

      {/* Senarai expenses */}
      <Card className="mt-6 !p-0">
        <h2 className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-700">
          Senarai Kos — {monthLabel}
        </h2>
        <table className="w-full text-sm">
          <tbody>
            {expenses.map((e) => (
              <tr key={e.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-5 py-3">
                  <Badge color={e.type === "ads" ? "blue" : e.type === "fixed" ? "purple" : "slate"}>
                    {EXPENSE_TYPE_LABELS[e.type as ExpenseType] ?? e.type}
                  </Badge>
                </td>
                <td className="px-5 py-3 font-medium text-slate-800">
                  {e.label}
                  {e.recurring && <span className="ml-2 text-xs text-slate-400">(bulanan)</span>}
                </td>
                <td className="px-5 py-3 text-slate-500">
                  {e.platform ? PLATFORM_LABELS[e.platform as Platform] : "Umum"}
                </td>
                <td className="px-5 py-3 text-slate-500">{formatDate(e.date)}</td>
                <td className="px-5 py-3 text-right font-medium">{formatRM(e.amount)}</td>
                <td className="px-5 py-3 text-right">
                  <form action={deleteExpenseAction.bind(null, e.id)}>
                    <button type="submit" className="text-slate-400 hover:text-red-600" title="Padam">
                      <Trash2 size={15} />
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {expenses.length === 0 && (
              <tr>
                <td className="px-5 py-8 text-center text-slate-400">Tiada kos direkod bulan ni</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
