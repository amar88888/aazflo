import type { ReactNode } from "react";
import { PageHeader, Card, Badge } from "@/components/ui";
import { KeyRound, PlayCircle, Film } from "lucide-react";
import {
  isMetaReady,
  fetchInsights,
  fetchCreativePerformance,
  summarize,
  type MetaDatePreset,
  type MetaInsightRow,
  type MetaCreativePerf,
} from "@/lib/integrations/meta-ads";

export const dynamic = "force-dynamic";

const PRESETS: { key: MetaDatePreset; label: string }[] = [
  { key: "today", label: "Hari ni" },
  { key: "yesterday", label: "Semalam" },
  { key: "last_7d", label: "7 hari" },
  { key: "last_14d", label: "14 hari" },
  { key: "last_30d", label: "30 hari" },
  { key: "maximum", label: "Semua" },
];

const rm = (n: number) => `RM${n.toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => n.toLocaleString("en-MY");

function roasColor(roas: number): "green" | "orange" | "red" {
  if (roas >= 2) return "green";
  if (roas >= 1) return "orange";
  return "red";
}
function statusColor(s: string | undefined): "green" | "orange" | "red" {
  if (s === "ACTIVE") return "green";
  if (s && s.includes("PAUSED")) return "orange";
  return "red";
}
function statusLabel(s: string | undefined): string {
  if (s === "ACTIVE") return "Aktif";
  if (s && s.includes("PAUSED")) return "Paused";
  return s || "—";
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card>
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-800">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
    </Card>
  );
}

export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const ready = await isMetaReady();
  const sp = await searchParams;
  const preset = (PRESETS.find((p) => p.key === sp.range)?.key ?? "maximum") as MetaDatePreset;

  if (!ready) {
    return (
      <div>
        <PageHeader title="Meta Ads" subtitle="ROAS, spend & prestasi ads terus dari Meta" />
        <Card>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 text-white">
              <KeyRound size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Setup Meta Ads dulu</h2>
              <p className="mt-1 text-sm text-slate-600">
                Buka <b>Settings</b> → kad <b>Meta Ads</b>, isi <b>Access Token</b> (permission{" "}
                <code className="rounded bg-slate-100 px-1 text-xs">ads_read</code>) & <b>Ad Account ID</b>.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  let campaigns: MetaInsightRow[] = [];
  let creatives: MetaCreativePerf[] = [];
  let error: string | null = null;
  try {
    [campaigns, creatives] = await Promise.all([
      fetchInsights({ level: "campaign", datePreset: preset }),
      fetchCreativePerformance({ datePreset: preset }),
    ]);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const sum = summarize(campaigns);
  const withSpend = creatives.filter((c) => c.spend > 0);
  const byRoas = [...withSpend].sort((a, b) => b.roas - a.roas);

  return (
    <div>
      <PageHeader title="Meta Ads" subtitle="ROAS, spend & prestasi setiap iklan — monitor & decide nak tutup" />

      <div className="mb-4 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <a
            key={p.key}
            href={`/ads?range=${p.key}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium ${
              p.key === preset ? "btn-primary" : "border border-slate-300 text-slate-600 hover:bg-slate-50"
            }`}
          >
            {p.label}
          </a>
        ))}
      </div>

      {error && (
        <Card>
          <p className="text-sm text-red-600">Gagal tarik data Meta: {error}</p>
          <p className="mt-1 text-xs text-slate-500">Semak token (mungkin expired) di Settings → Meta Ads.</p>
        </Card>
      )}

      {!error && (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="ROAS" value={`${sum.roas.toFixed(2)}x`} sub={sum.roas >= 1 ? "Untung" : "Bawah modal"} />
            <Stat label="Jualan" value={rm(sum.purchaseValue)} sub={`${num(sum.purchases)} purchase`} />
            <Stat label="Spend Iklan" value={rm(sum.spend)} />
            <Stat
              label="Cost / Purchase"
              value={sum.purchases > 0 ? rm(sum.spend / sum.purchases) : "—"}
              sub="Pururata semua"
            />
          </div>

          {/* Creative performance grid */}
          <Card>
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700">Prestasi Setiap Iklan (Creative)</h2>
              <span className="text-xs text-slate-400">Disusun ROAS tertinggi → rendah</span>
            </div>
            <p className="mb-4 text-xs text-slate-500">
              🟢 ROAS ≥ 2x untung besar · 🟠 1–2x sederhana · 🔴 &lt; 1x rugi (pertimbang tutup)
            </p>

            {byRoas.length === 0 ? (
              <p className="text-sm text-slate-500">
                Tiada iklan dengan spend untuk tempoh ni. Cuba tekan <b>Semua</b> di atas, atau tunggu ads jalan.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {byRoas.map((c) => (
                  <CreativeCard key={c.id} c={c} />
                ))}
              </div>
            )}
          </Card>

          {/* Campaign summary table */}
          <Card className="mt-5">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Ringkasan Campaign</h2>
            {campaigns.length === 0 ? (
              <p className="text-sm text-slate-500">Tiada data campaign untuk tempoh ni.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th className="pb-2 pr-3">Campaign</th>
                      <th className="pb-2 pr-3 text-right">Spend</th>
                      <th className="pb-2 pr-3 text-right">Jualan</th>
                      <th className="pb-2 pr-3 text-right">ROAS</th>
                      <th className="pb-2 text-right">Purchase</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...campaigns]
                      .sort((a, b) => b.spend - a.spend)
                      .map((c) => (
                        <tr key={c.id} className="border-b border-slate-100">
                          <td className="py-2 pr-3 font-medium text-slate-700">{c.name}</td>
                          <td className="py-2 pr-3 text-right text-slate-600">{rm(c.spend)}</td>
                          <td className="py-2 pr-3 text-right text-slate-600">{rm(c.purchaseValue)}</td>
                          <td className="py-2 pr-3 text-right">
                            <Badge color={roasColor(c.roas)}>{c.roas.toFixed(2)}x</Badge>
                          </td>
                          <td className="py-2 text-right text-slate-600">{num(c.purchases)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" | "muted" }) {
  const color = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : "text-slate-700";
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-sm font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function CreativeCard({ c }: { c: MetaCreativePerf }) {
  const rc = roasColor(c.roas);
  const ring = rc === "green" ? "ring-emerald-200" : rc === "orange" ? "ring-amber-200" : "ring-red-200";
  const badSpender = c.roas < 1 && c.spend >= 20;
  return (
    <div className={`overflow-hidden rounded-xl border border-slate-200 ring-1 ${ring}`}>
      <div className="relative flex h-40 items-center justify-center bg-slate-900">
        {c.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/meta-thumb?url=${encodeURIComponent(c.thumbnailUrl)}`}
            alt={c.name}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <Film size={28} className="text-slate-500" />
        )}
        {c.videoId && (
          <span className="absolute left-2 top-2 rounded-full bg-black/60 p-1 text-white">
            <PlayCircle size={16} />
          </span>
        )}
        <span className="absolute right-2 top-2">
          <Badge color={statusColor(c.status)}>{statusLabel(c.status)}</Badge>
        </span>
        <span className="absolute bottom-2 right-2 rounded-md bg-black/70 px-2 py-0.5 text-sm font-bold text-white">
          {c.roas.toFixed(2)}x
        </span>
      </div>

      <div className="p-3">
        <p className="truncate text-sm font-medium text-slate-700" title={c.name}>
          {c.name}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Metric label="Spend" value={rm(c.spend)} tone="muted" />
          <Metric label="Jualan" value={rm(c.purchaseValue)} tone="muted" />
          <Metric label="Beli" value={num(c.purchases)} tone="muted" />
          <Metric
            label="CPP"
            value={c.costPerPurchase > 0 ? rm(c.costPerPurchase) : "—"}
            tone={c.costPerPurchase > 0 && c.costPerPurchase <= 30 ? "good" : c.costPerPurchase > 60 ? "bad" : "muted"}
          />
          <Metric label="Conv %" value={c.convRate > 0 ? `${c.convRate.toFixed(1)}%` : "—"} tone="muted" />
          <Metric label="CTR" value={`${c.ctr.toFixed(2)}%`} tone="muted" />
        </div>
        {badSpender && (
          <p className="mt-2 rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-600">
            ⚠️ ROAS bawah modal — pertimbang tutup iklan ni
          </p>
        )}
      </div>
    </div>
  );
}
