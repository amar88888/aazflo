import type { ReactNode } from "react";
import { PageHeader, Card, Badge } from "@/components/ui";
import { KeyRound, TrendingUp, TrendingDown } from "lucide-react";
import {
  isMetaReady,
  fetchInsights,
  summarize,
  type MetaDatePreset,
  type MetaInsightRow,
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
  const preset = (PRESETS.find((p) => p.key === sp.range)?.key ?? "last_7d") as MetaDatePreset;

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
                <code className="rounded bg-slate-100 px-1 text-xs">ads_read</code>) & <b>Ad Account ID</b>. Lepas tu
                dashboard ROAS akan muncul sini.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  let campaigns: MetaInsightRow[] = [];
  let ads: MetaInsightRow[] = [];
  let error: string | null = null;
  try {
    [campaigns, ads] = await Promise.all([
      fetchInsights({ level: "campaign", datePreset: preset }),
      fetchInsights({ level: "ad", datePreset: preset }),
    ]);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const sum = summarize(campaigns);
  const campSorted = [...campaigns].sort((a, b) => b.spend - a.spend);
  const adsWithSpend = ads.filter((a) => a.spend > 0);
  const adsByRoas = [...adsWithSpend].sort((a, b) => b.roas - a.roas);
  const winners = adsByRoas.slice(0, 5);
  const losers = [...adsWithSpend].sort((a, b) => a.roas - b.roas).slice(0, 5);

  return (
    <div>
      <PageHeader title="Meta Ads" subtitle="ROAS, spend & prestasi ads terus dari Meta" />

      {/* Date range */}
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
          <p className="mt-1 text-xs text-slate-500">
            Semak token (mungkin expired) & Ad Account ID di Settings → Meta Ads.
          </p>
        </Card>
      )}

      {!error && (
        <>
          {/* Summary */}
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="ROAS" value={`${sum.roas.toFixed(2)}x`} sub={sum.roas >= 1 ? "Untung" : "Bawah modal"} />
            <Stat label="Jualan (Purchase Value)" value={rm(sum.purchaseValue)} sub={`${num(sum.purchases)} purchase`} />
            <Stat label="Spend Iklan" value={rm(sum.spend)} />
            <Stat label="CTR" value={`${sum.ctr.toFixed(2)}%`} sub={`${num(sum.clicks)} klik`} />
          </div>

          {/* Campaigns */}
          <Card>
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Campaign</h2>
            {campSorted.length === 0 ? (
              <p className="text-sm text-slate-500">Tiada data untuk tempoh ni.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                      <th className="pb-2 pr-3">Campaign</th>
                      <th className="pb-2 pr-3 text-right">Spend</th>
                      <th className="pb-2 pr-3 text-right">Jualan</th>
                      <th className="pb-2 pr-3 text-right">ROAS</th>
                      <th className="pb-2 pr-3 text-right">Purchase</th>
                      <th className="pb-2 text-right">Cost/Beli</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campSorted.map((c) => (
                      <tr key={c.id} className="border-b border-slate-100">
                        <td className="py-2 pr-3 font-medium text-slate-700">{c.name}</td>
                        <td className="py-2 pr-3 text-right text-slate-600">{rm(c.spend)}</td>
                        <td className="py-2 pr-3 text-right text-slate-600">{rm(c.purchaseValue)}</td>
                        <td className="py-2 pr-3 text-right">
                          <Badge color={roasColor(c.roas)}>{c.roas.toFixed(2)}x</Badge>
                        </td>
                        <td className="py-2 pr-3 text-right text-slate-600">{num(c.purchases)}</td>
                        <td className="py-2 text-right text-slate-600">
                          {c.costPerPurchase > 0 ? rm(c.costPerPurchase) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* Winners / Losers */}
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <AdList
              title="Ads MENANG (ROAS tertinggi)"
              icon={<TrendingUp size={16} className="text-emerald-500" />}
              rows={winners}
            />
            <AdList
              title="Ads KALAH (ROAS terendah — pertimbang matikan)"
              icon={<TrendingDown size={16} className="text-red-500" />}
              rows={losers}
            />
          </div>
        </>
      )}
    </div>
  );
}

function AdList({ title, icon, rows }: { title: string; icon: ReactNode; rows: MetaInsightRow[] }) {
  return (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold text-slate-700">{title}</h2>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500">Tiada data.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((a) => (
            <div key={a.id} className="rounded-lg border border-slate-100 p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-medium text-slate-700">{a.name}</span>
                <Badge color={roasColor(a.roas)}>{a.roas.toFixed(2)}x</Badge>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                <span>Spend {rm(a.spend)}</span>
                <span>Jualan {rm(a.purchaseValue)}</span>
                <span>{num(a.purchases)} beli</span>
                {a.hookRate > 0 && <span>Hook {a.hookRate.toFixed(0)}%</span>}
                {a.holdRate > 0 && <span>Hold {a.holdRate.toFixed(0)}%</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
