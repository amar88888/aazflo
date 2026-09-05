import { db } from "@/lib/db";
import { formatRM, formatDate } from "@/lib/format";
import {
  CASH_TYPES,
  CASH_TYPE_LABELS,
  CASH_CATEGORIES,
  CASH_CATEGORY_LABELS,
  type CashType,
  type CashCategory,
} from "@/lib/constants";
import { PageHeader, Card, StatCard, Badge, EmptyState } from "@/components/ui";
import {
  addAttendanceAction,
  addSupplyAction,
  adjustStockAction,
  setStockAction,
  deleteSupplyAction,
  addCashTxnAction,
  deleteCashTxnAction,
} from "./actions";
import { startOfDay, endOfDay, format } from "date-fns";
import { Users, Wallet, PackageOpen, ReceiptText, Trash2, FileText, Minus, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OpsPage() {
  const now = new Date();
  const [attendanceToday, attendanceRecent, supplies, txns] = await Promise.all([
    db.attendance.findMany({ where: { date: { gte: startOfDay(now), lte: endOfDay(now) } } }),
    db.attendance.findMany({ orderBy: { date: "desc" }, take: 8 }),
    db.supply.findMany({ orderBy: { name: "asc" } }),
    db.cashTxn.findMany({ orderBy: { date: "desc" }, take: 30 }),
  ]);

  const partTimersToday = attendanceToday.reduce((s, a) => s + a.partTimers, 0);
  const reorderList = supplies.filter((s) => s.currentStock <= s.reorderLevel);

  const balance = txns.length
    ? (await db.cashTxn.findMany()).reduce(
        (s, t) => s + (t.type === "topup" ? t.amount : -t.amount),
        0
      )
    : 0;
  const receiptsCount = await db.cashTxn.count({ where: { receiptPath: { not: null } } });

  const today = format(now, "yyyy-MM-dd");

  return (
    <div>
      <PageHeader title="Operasi Office" subtitle="Kehadiran, stok barang, duit office & resit" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Part-timer Hari Ni" value={String(partTimersToday)} icon={Users} tone="violet" />
        <StatCard label="Baki Duit Office" value={formatRM(balance)} icon={Wallet} tone="emerald" accent={balance >= 0 ? "green" : "red"} />
        <StatCard
          label="Barang Perlu Order"
          value={String(reorderList.length)}
          sub={reorderList.length > 0 ? "Stok rendah!" : "Semua cukup ✓"}
          icon={PackageOpen}
          tone="amber"
          accent={reorderList.length > 0 ? "red" : "green"}
        />
        <StatCard label="Resit Tersimpan" value={String(receiptsCount)} icon={ReceiptText} tone="cyan" />
      </div>

      {/* Reorder alert */}
      {reorderList.length > 0 && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠ <span className="font-medium">Barang perlu order:</span>{" "}
          {reorderList.map((s) => `${s.name} (tinggal ${s.currentStock} ${s.unit})`).join(", ")}
        </div>
      )}

      {/* ── Stok Barang ── */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 !p-0">
          <h2 className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-700">
            Stok Barang Packaging
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5">Barang</th>
                <th className="px-5 py-2.5 text-center">Stok</th>
                <th className="px-5 py-2.5 text-center">Reorder bila ≤</th>
                <th className="px-5 py-2.5">Status</th>
                <th className="px-5 py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {supplies.map((s) => {
                const low = s.currentStock <= s.reorderLevel;
                return (
                  <tr key={s.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-5 py-3 font-medium text-slate-800">
                      {s.name} <span className="text-xs text-slate-400">({s.unit})</span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center justify-center gap-1.5">
                        <form action={adjustStockAction.bind(null, s.id, -1)}>
                          <button className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100" title="Kurang">
                            <Minus size={13} />
                          </button>
                        </form>
                        {/* Taip terus nilai stok → Enter untuk simpan */}
                        <form action={setStockAction}>
                          <input type="hidden" name="id" value={s.id} />
                          <input
                            name="value"
                            type="number"
                            min="0"
                            defaultValue={s.currentStock}
                            title="Taip nilai baru, tekan Enter"
                            className="w-16 rounded-md border border-slate-200 px-1 py-0.5 text-center font-semibold focus:border-violet-500 focus:outline-none"
                          />
                        </form>
                        <form action={adjustStockAction.bind(null, s.id, 1)}>
                          <button className="flex h-6 w-6 items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100" title="Tambah">
                            <Plus size={13} />
                          </button>
                        </form>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-center text-slate-500">{s.reorderLevel}</td>
                    <td className="px-5 py-3">
                      <Badge color={low ? "red" : "green"}>{low ? "Perlu order" : "Cukup"}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <form action={deleteSupplyAction.bind(null, s.id)}>
                        <button className="text-slate-400 hover:text-red-600" title="Padam">
                          <Trash2 size={15} />
                        </button>
                      </form>
                    </td>
                  </tr>
                );
              })}
              {supplies.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400">
                    Belum ada barang — tambah di sebelah
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Tambah Barang</h2>
          <form action={addSupplyAction} className="space-y-3">
            <input name="name" required placeholder="cth: Bubble Wrap" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <input name="unit" placeholder="Unit (cth: roll, pcs, kotak)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Stok sekarang</label>
                <input name="currentStock" type="number" min="0" defaultValue={0} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Reorder bila ≤</label>
                <input name="reorderLevel" type="number" min="0" defaultValue={0} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <button className="btn-primary w-full rounded-lg py-2 text-sm font-medium">Simpan Barang</button>
          </form>
        </Card>
      </div>

      {/* ── Kehadiran ── */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-slate-700">Rekod Kehadiran Hari Ni</h2>
          <form action={addAttendanceAction} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Tarikh</label>
                <input name="date" type="date" required defaultValue={today} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Bil. part-timer</label>
                <input name="partTimers" type="number" min="0" required defaultValue={0} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <input name="names" placeholder="Nama (optional, pisah dengan koma)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Jumlah gaji (RM, optional)</label>
              <input name="wageTotal" type="number" step="0.01" min="0" defaultValue={0} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <button className="btn-primary w-full rounded-lg py-2 text-sm font-medium">Rekod Kehadiran</button>
          </form>
        </Card>

        <Card className="lg:col-span-2 !p-0">
          <h2 className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-700">Sejarah Kehadiran</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-5 py-2.5">Tarikh</th>
                <th className="px-5 py-2.5 text-center">Part-timer</th>
                <th className="px-5 py-2.5">Nama</th>
                <th className="px-5 py-2.5 text-right">Gaji</th>
              </tr>
            </thead>
            <tbody>
              {attendanceRecent.map((a) => (
                <tr key={a.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-5 py-3 text-slate-600">{formatDate(a.date)}</td>
                  <td className="px-5 py-3 text-center font-semibold">{a.partTimers}</td>
                  <td className="px-5 py-3 text-slate-500">{a.names ?? "-"}</td>
                  <td className="px-5 py-3 text-right">{a.wageTotal > 0 ? formatRM(a.wageTotal) : "-"}</td>
                </tr>
              ))}
              {attendanceRecent.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-400">Belum ada rekod kehadiran</td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </div>

      {/* ── Duit Office ── */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-slate-700">Duit Office (Petty Cash)</h2>
          <p className="mb-4 text-3xl font-bold text-emerald-600">{formatRM(balance)}</p>
          <form action={addCashTxnAction} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Jenis</label>
                <select name="type" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {CASH_TYPES.map((t) => (
                    <option key={t} value={t}>{CASH_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Kategori</label>
                <select name="category" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {CASH_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CASH_CATEGORY_LABELS[c]}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Amaun (RM)</label>
                <input name="amount" type="number" step="0.01" min="0.01" required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Tarikh</label>
                <input name="date" type="date" required defaultValue={today} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <input name="description" placeholder="Keterangan (cth: Lalamove hantar parcel)" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Scan resit (JPG/PNG/PDF → jadi PDF)</label>
              <input name="receipt" type="file" accept="image/*,application/pdf" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm" />
            </div>
            <button className="btn-primary w-full rounded-lg py-2 text-sm font-medium">Rekod & Simpan Resit</button>
          </form>
        </Card>

        <Card className="lg:col-span-2 !p-0">
          <h2 className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-700">Transaksi & Resit</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-5 py-2.5">Tarikh</th>
                  <th className="px-5 py-2.5">Keterangan</th>
                  <th className="px-5 py-2.5">Kategori</th>
                  <th className="px-5 py-2.5 text-right">Amaun</th>
                  <th className="px-5 py-2.5">Resit</th>
                  <th className="px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {txns.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                    <td className="px-5 py-3 text-slate-500">{formatDate(t.date)}</td>
                    <td className="px-5 py-3">
                      <p className="font-medium text-slate-800">{t.description ?? CASH_TYPE_LABELS[t.type as CashType]}</p>
                      <Badge color={t.type === "topup" ? "green" : t.type === "claim" ? "orange" : "blue"}>
                        {CASH_TYPE_LABELS[t.type as CashType] ?? t.type}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{CASH_CATEGORY_LABELS[t.category as CashCategory] ?? t.category}</td>
                    <td className={`px-5 py-3 text-right font-medium ${t.type === "topup" ? "text-emerald-600" : "text-red-600"}`}>
                      {t.type === "topup" ? "+" : "−"}{formatRM(t.amount)}
                    </td>
                    <td className="px-5 py-3">
                      {t.receiptPath ? (
                        <a href={`/api/receipts/${t.receiptPath}`} target="_blank" className="inline-flex items-center gap-1 text-blue-600 hover:underline">
                          <FileText size={14} /> Lihat
                        </a>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <form action={deleteCashTxnAction.bind(null, t.id)}>
                        <button className="text-slate-400 hover:text-red-600" title="Padam">
                          <Trash2 size={15} />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
                {txns.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState title="Belum ada transaksi" hint="Rekod top-up, perbelanjaan, atau claim di sebelah." />
                    </td>
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
