import { getCashflowData, type StoreCashflow } from "@/lib/cashflow";
import { formatRM } from "@/lib/format";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { startOfMonth, endOfMonth, format } from "date-fns";
import Link from "next/link";
import { Banknote, Truck, XCircle, Wallet } from "lucide-react";

export const dynamic = "force-dynamic";

const STORE_LABELS: Record<string, string> = {
  maxlim: "Maxlim (maxlim.shop)",
  facelim: "Facelim MY (facelim.com)",
  facelimsg: "Facelim SG (facelimsg.com)",
  maxlimsg: "Maxlim SG (maxlimsg.com)",
};

function fmt(cur: "RM" | "SGD", n: number): string {
  if (cur === "RM") return formatRM(n);
  return "S$" + Math.round(n).toLocaleString("en-SG");
}

function storeLabel(key: string): string {
  return STORE_LABELS[key] ?? key;
}

export default async function CashflowPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const base = params.month ? new Date(`${params.month}-01T00:00:00`) : new Date();
  const from = startOfMonth(base);
  const to = endOfMonth(base);

  const stores = await getCashflowData(from, to);

  const monthLabel = format(from, "MMMM yyyy");
  const prevMonth = format(new Date(from.getFullYear(), from.getMonth() - 1, 1), "yyyy-MM");
  const nextMonth = format(new Date(from.getFullYear(), from.getMonth() + 1, 1), "yyyy-MM");

  // Agregat ikut mata wang (RM & SGD tak boleh dicampur)
  const agg = (cur: "RM" | "SGD") => {
    const ss = stores.filter((s) => s.currency === cur);
    return {
      masuk: ss.reduce((a, s) => a + s.masuk, 0),
      transit: ss.reduce((a, s) => a + s.transit, 0),
      lost: ss.reduce((a, s) => a + s.lost, 0),
      has: ss.length > 0,
    };
  };
  const rm = agg("RM");
  const sg = agg("SGD");

  return (
    <div>
      <PageHeader
        title="Cashflow — Hunt COD"
        subtitle={`Duit masuk vs lost · ${monthLabel}`}
        action={
          <div className="flex gap-2 text-sm">
            <Link href={`/cashflow?month=${prevMonth}`} className="btn-secondary rounded-lg px-3 py-1.5">
              ← Bulan lepas
            </Link>
            <Link href={`/cashflow?month=${nextMonth}`} className="btn-secondary rounded-lg px-3 py-1.5">
              Bulan depan →
            </Link>
          </div>
        }
      />

      {/* Hero agregat ikut mata wang */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {rm.has && (
          <>
            <StatCard label="MY · Duit Masuk" value={fmt("RM", rm.masuk)} sub="Delivered / completed" accent="green" icon={Banknote} tone="emerald" />
            <StatCard label="MY · Dalam Perjalanan" value={fmt("RM", rm.transit)} sub="COD belum kutip" icon={Truck} tone="cyan" />
          </>
        )}
        {sg.has && (
          <>
            <StatCard label="SG · Duit Masuk" value={fmt("SGD", sg.masuk)} sub="Delivered / completed" accent="green" icon={Banknote} tone="emerald" />
            <StatCard label="SG · Dalam Perjalanan" value={fmt("SGD", sg.transit)} sub="COD belum kutip" icon={Truck} tone="cyan" />
          </>
        )}
      </div>

      {/* Nota penting */}
      <div className="mt-4 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-900">
        <b>Duit Masuk</b> = parcel delivered (COD dikutip atau prepaid) — NinjaVan remit ke bank ikut kitaran mingguan (~1 minggu lepas delivered).{" "}
        <b>Perjalanan</b> = COD belum kutip. <b>Lost</b> = batal / RTO / refund.
      </div>

      {/* Per kedai */}
      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {stores.length === 0 && (
          <Card>
            <div className="py-8 text-center text-slate-400">
              Tiada data. Sambung kedai di{" "}
              <Link href="/settings" className="font-medium text-violet-600 underline">
                Settings
              </Link>{" "}
              &amp; jalankan sync-woo.
            </div>
          </Card>
        )}
        {stores.map((s) => (
          <StoreCard key={s.store} s={s} label={storeLabel(s.store)} />
        ))}
      </div>
    </div>
  );
}

function StoreCard({ s, label }: { s: StoreCashflow; label: string }) {
  const denom = s.masuk + s.transit + s.lost || 1;
  const pMasuk = (s.masuk / denom) * 100;
  const pTransit = (s.transit / denom) * 100;
  const pLost = (s.lost / denom) * 100;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-800">{label}</h3>
        <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">
          {s.collectRate.toFixed(0)}% collect rate
        </span>
      </div>

      {/* Bar nisbah masuk / transit / lost */}
      <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        <div className="bg-emerald-500" style={{ width: `${pMasuk}%` }} />
        <div className="bg-cyan-400" style={{ width: `${pTransit}%` }} />
        <div className="bg-red-400" style={{ width: `${pLost}%` }} />
      </div>

      <div className="space-y-2.5 text-sm">
        <Row icon={<Banknote size={15} className="text-emerald-600" />} label="Duit masuk" n={s.masukN} value={fmt(s.currency, s.masuk)} valueClass="text-emerald-600" />
        <Row icon={<Truck size={15} className="text-cyan-500" />} label="Dalam perjalanan" n={s.transitN} value={fmt(s.currency, s.transit)} valueClass="text-cyan-600" />
        <Row icon={<XCircle size={15} className="text-red-500" />} label="Lost (RTO/batal)" n={s.lostN} value={fmt(s.currency, s.lost)} valueClass="text-red-500" />
        <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2.5">
          <span className="flex items-center gap-2 font-semibold text-slate-700">
            <Wallet size={15} /> Jumlah aktif
          </span>
          <span className="font-bold text-slate-900">{fmt(s.currency, s.total)}</span>
        </div>
      </div>
    </Card>
  );
}

function Row({
  icon,
  label,
  n,
  value,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  n: number;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-slate-600">
        {icon}
        {label}
        <span className="text-xs text-slate-400">· {n} order</span>
      </span>
      <span className={`font-semibold ${valueClass}`}>{value}</span>
    </div>
  );
}
