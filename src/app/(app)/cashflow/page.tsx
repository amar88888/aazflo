import { getCashflowData, type StoreCashflow } from "@/lib/cashflow";
import { fetchStripeBalance, fetchStripePayouts, type StripePayout, type StripeBalance } from "@/lib/integrations/stripe";
import { formatRM } from "@/lib/format";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { startOfMonth, endOfMonth, format } from "date-fns";
import Link from "next/link";
import { Banknote, Truck, XCircle, Wallet, CreditCard, Landmark } from "lucide-react";

function curSym(c: string): string {
  const u = c.toUpperCase();
  return u === "MYR" ? "RM" : u === "SGD" ? "S$" : u + " ";
}
function fmtSen(currency: string, sen: number): string {
  return curSym(currency) + Math.round(sen / 100).toLocaleString("en-US");
}

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

  // Stripe (duit kad): balance + payout ke bank bulan ni. Defensif — skip kalau tak configured.
  let stripeBalance: StripeBalance | null = null;
  let stripePayouts: StripePayout[] = [];
  try {
    [stripeBalance, stripePayouts] = await Promise.all([
      fetchStripeBalance(),
      fetchStripePayouts({ from, to, limit: 50 }),
    ]);
  } catch {
    /* abaikan — jangan gagalkan page */
  }

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
      <div className="mt-4 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-300 backdrop-blur">
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

      {(stripeBalance || stripePayouts.length > 0) && (
        <StripeSection balance={stripeBalance} payouts={stripePayouts} monthLabel={monthLabel} />
      )}
    </div>
  );
}

function StripeSection({
  balance,
  payouts,
  monthLabel,
}: {
  balance: StripeBalance | null;
  payouts: StripePayout[];
  monthLabel: string;
}) {
  const paid = payouts.filter((p) => p.status === "paid");
  // payout ikut currency
  const paidByCur = new Map<string, number>();
  for (const p of paid) paidByCur.set(p.currency, (paidByCur.get(p.currency) ?? 0) + p.amount);
  const upcoming = payouts.filter((p) => p.status !== "paid");

  return (
    <div className="mt-6">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
        <CreditCard size={16} className="text-slate-300" /> Stripe — Duit Kad
      </h2>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Dah masuk bank */}
        <Card>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <Landmark size={15} className="text-emerald-400" /> Payout ke bank — {monthLabel}
          </div>
          {paidByCur.size === 0 ? (
            <p className="py-3 text-sm text-slate-400">Tiada payout tiba bulan ni.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {[...paidByCur.entries()].map(([cur, amt]) => (
                <div key={cur} className="flex items-center justify-between">
                  <span className="text-slate-600">Dah masuk bank ({cur})</span>
                  <span className="font-bold text-emerald-400">{fmtSen(cur, amt)}</span>
                </div>
              ))}
              <p className="pt-1 text-xs text-slate-400">{paid.length} payout selesai</p>
            </div>
          )}
          {upcoming.length > 0 && (
            <p className="mt-2 border-t border-slate-100 pt-2 text-xs text-slate-500">
              + {upcoming.length} payout dalam perjalanan ke bank
            </p>
          )}
        </Card>

        {/* Dalam Stripe (belum payout) */}
        <Card>
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-800">
            <CreditCard size={15} className="text-slate-300" /> Baki dalam Stripe
          </div>
          {!balance ? (
            <p className="py-3 text-sm text-slate-400">—</p>
          ) : (
            <div className="space-y-2 text-sm">
              {balance.pending.map((b, i) => (
                <div key={`p${i}`} className="flex items-center justify-between">
                  <span className="text-slate-600">Pending ({b.currency.toUpperCase()})</span>
                  <span className="font-semibold text-amber-600">{fmtSen(b.currency, b.amount)}</span>
                </div>
              ))}
              {balance.available.map((b, i) => (
                <div key={`a${i}`} className="flex items-center justify-between">
                  <span className="text-slate-600">Available ({b.currency.toUpperCase()})</span>
                  <span className="font-semibold text-slate-800">{fmtSen(b.currency, b.amount)}</span>
                </div>
              ))}
              <p className="pt-1 text-xs text-slate-400">Belum payout — akan masuk bank ikut jadual Stripe.</p>
            </div>
          )}
        </Card>
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
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-300 ring-1 ring-emerald-400/20">
          {s.collectRate.toFixed(0)}% collect rate
        </span>
      </div>

      {/* Bar nisbah masuk / transit / lost */}
      <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-white/10">
        <div className="bg-emerald-400" style={{ width: `${pMasuk}%` }} />
        <div className="bg-slate-400" style={{ width: `${pTransit}%` }} />
        <div className="bg-rose-500" style={{ width: `${pLost}%` }} />
      </div>

      <div className="space-y-2.5 text-sm">
        <Row icon={<Banknote size={15} className="text-emerald-400" />} label="Duit masuk" n={s.masukN} value={fmt(s.currency, s.masuk)} valueClass="text-emerald-400" />
        <Row icon={<Truck size={15} className="text-slate-300" />} label="Dalam perjalanan" n={s.transitN} value={fmt(s.currency, s.transit)} valueClass="text-slate-200" />
        <Row icon={<XCircle size={15} className="text-rose-400" />} label="Lost (RTO/batal)" n={s.lostN} value={fmt(s.currency, s.lost)} valueClass="text-rose-400" />
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
