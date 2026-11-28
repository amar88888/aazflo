import { PageHeader, Card, StatCard } from "@/components/ui";
import { getFakes, TRADEMARK, PORTALS } from "@/lib/fake-hunter";
import { FakesBoard } from "./fakes-board";
import { ShieldAlert, Store, Send, CheckCircle2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FakesPage() {
  const list = await getFakes();
  const active = list.filter((l) => l.status !== "abaikan");
  const shops = new Set(active.map((l) => `${l.platform}:${l.shopId || l.shop}`));
  const reported = active.filter((l) => l.status === "dah_adu").length;
  const removed = active.filter((l) => l.status === "dibuang").length;
  const pending = active.filter((l) => l.status === "disyaki").length;
  const soldFake = active.filter((l) => l.status !== "dibuang").reduce((s, l) => s + (l.sold ?? 0), 0);

  return (
    <div>
      <PageHeader
        title="Fake Hunter"
        subtitle="Kedai & listing yang guna nama EVIOR / Facelim / Maxlim tanpa izin — adu & pantau sampai dibuang"
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Listing disyaki" value={String(pending)} sub={`${active.length} jumlah`} icon={ShieldAlert} tone="amber" accent="red" />
        <StatCard label="Kedai palsu" value={String(shops.size)} sub={`~${soldFake} unit dah terjual`} icon={Store} tone="violet" />
        <StatCard label="Dah adu" value={String(reported)} icon={Send} tone="cyan" />
        <StatCard label="Dah dibuang" value={String(removed)} icon={CheckCircle2} tone="emerald" accent="green" />
      </div>

      <Card className="mt-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">🛡️ Senjata: cap dagangan berdaftar</h2>
            <p className="mt-1 text-sm text-slate-300">
              <b>{TRADEMARK.mark}</b> · {TRADEMARK.number} · {TRADEMARK.klass} · sah hingga {TRADEMARK.validUntil}
            </p>
            <p className="mt-1 text-xs text-slate-400">Bukti: {TRADEMARK.proof}. Ejen: {TRADEMARK.agent}.</p>
            <p className="mt-1 text-xs text-slate-400">
              Nama &quot;Facelim&quot; / &quot;Maxlim&quot; belum berdaftar → adu guna EVIOR (jika listing/botol guna EVIOR) atau hak cipta gambar kita.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(PORTALS).map(([k, p]) => (
              <a
                key={k}
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium text-slate-100 ring-1 ring-white/10 hover:bg-white/20"
              >
                {p.name} ↗
              </a>
            ))}
          </div>
        </div>
      </Card>

      <Card className="mt-6 !p-0">
        <FakesBoard rows={list} />
      </Card>
    </div>
  );
}
