"use client";

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import {
  FAKE_STATUSES,
  FAKE_STATUS_LABEL,
  complaintText,
  type FakeListing,
  type FakeStatus,
} from "@/lib/fake-hunter-shared";
import { setFakeStatusAction, addFakeAction, deleteFakeAction } from "./actions";

const RISK_COLOR: Record<string, string> = { TINGGI: "red", SEDERHANA: "orange", SEMAK: "slate" };
const STATUS_COLOR: Record<FakeStatus, string> = { disyaki: "orange", dah_adu: "blue", dibuang: "green", abaikan: "slate" };

export function FakesBoard({ rows }: { rows: FakeListing[] }) {
  const [platform, setPlatform] = useState("Semua");
  const [status, setStatus] = useState<"aktif" | FakeStatus>("aktif");
  const [copied, setCopied] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const platforms = useMemo(() => ["Semua", ...Array.from(new Set(rows.map((r) => r.platform)))], [rows]);
  const shown = rows
    .filter((r) => platform === "Semua" || r.platform === platform)
    .filter((r) => (status === "aktif" ? r.status === "disyaki" || r.status === "dah_adu" : r.status === status))
    .sort((a, b) => (a.risk === b.risk ? (b.sold ?? 0) - (a.sold ?? 0) : a.risk === "TINGGI" ? -1 : b.risk === "TINGGI" ? 1 : 0));

  async function copy(r: FakeListing) {
    await navigator.clipboard.writeText(complaintText(r));
    setCopied(r.id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div>
      <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {platforms.map((p) => (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${platform === p ? "bg-white/25 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
            >
              {p} ({p === "Semua" ? rows.length : rows.filter((r) => r.platform === p).length})
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["aktif", ...FAKE_STATUSES] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${status === s ? "bg-white/25 text-white" : "bg-white/5 text-slate-300 hover:bg-white/10"}`}
            >
              {s === "aktif" ? "Belum selesai" : FAKE_STATUS_LABEL[s]}
            </button>
          ))}
        </div>
      </div>

      <form
        className="flex flex-col gap-2 border-b border-white/10 px-5 py-3 sm:flex-row"
        action={(fd) =>
          start(async () => {
            const r = await addFakeAction(fd);
            setMsg(r.message);
          })
        }
      >
        <input name="url" placeholder="Tampal link listing / kedai palsu (Shopee, TikTok, Lazada, FB…)" className="min-w-0 flex-1 rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10 placeholder:text-slate-500" />
        <input name="shop" placeholder="Nama kedai (pilihan)" className="rounded-lg bg-white/5 px-3 py-2 text-sm text-slate-100 ring-1 ring-white/10 placeholder:text-slate-500 sm:w-48" />
        <button disabled={pending} className="rounded-lg bg-rose-500/80 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50">
          + Tambah
        </button>
        {msg && <span className="self-center text-xs text-slate-300">{msg}</span>}
      </form>

      <div className="overflow-x-auto p-3">
        <table className="w-full min-w-[900px] text-sm [&_td]:px-2 [&_th]:px-2">
          <thead>
            <tr className="border-b border-white/10 text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="pb-2 pl-1">Listing / Kedai</th>
              <th className="pb-2">Platform</th>
              <th className="pb-2">Risiko</th>
              <th className="pb-2 text-right">Harga</th>
              <th className="pb-2 text-right">Terjual</th>
              <th className="pb-2">Status</th>
              <th className="pb-2 pr-1 text-right">Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm text-slate-400">
                  Tiada listing dalam penapis ni 🎉
                </td>
              </tr>
            )}
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-white/5 align-top hover:bg-white/5">
                <td className="py-2.5 pl-1">
                  <a href={r.url} target="_blank" rel="noreferrer" className="font-medium text-slate-100 hover:underline">
                    {r.title}
                  </a>
                  <p className="text-xs text-slate-400">
                    {r.shop}
                    {r.location ? ` · ${r.location}` : ""}
                  </p>
                  {r.reason && <p className="text-xs text-slate-500">{r.reason}</p>}
                  {r.note && <p className="text-xs text-amber-300/80">📝 {r.note}</p>}
                </td>
                <td className="py-2.5 text-slate-300">{r.platform}</td>
                <td className="py-2.5">
                  <Badge color={RISK_COLOR[r.risk] ?? "slate"}>{r.risk}</Badge>
                </td>
                <td className="py-2.5 text-right text-slate-200">{r.price != null ? `RM${r.price.toFixed(2)}` : "-"}</td>
                <td className="py-2.5 text-right text-slate-200">{r.sold ?? "-"}</td>
                <td className="py-2.5">
                  <select
                    value={r.status}
                    disabled={pending}
                    onChange={(e) => start(() => setFakeStatusAction(r.id, e.target.value))}
                    className="rounded-md bg-white/5 px-2 py-1 text-xs text-slate-100 ring-1 ring-white/10"
                  >
                    {FAKE_STATUSES.map((s) => (
                      <option key={s} value={s} className="bg-slate-800">
                        {FAKE_STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1">
                    <Badge color={STATUS_COLOR[r.status]}>{FAKE_STATUS_LABEL[r.status]}</Badge>
                  </div>
                </td>
                <td className="py-2.5 pr-1 text-right">
                  <div className="flex flex-col items-end gap-1">
                    <button onClick={() => copy(r)} className="rounded-md bg-white/10 px-2.5 py-1 text-xs text-slate-100 hover:bg-white/20">
                      {copied === r.id ? "Disalin ✅" : "Salin ayat aduan"}
                    </button>
                    <button
                      onClick={() => {
                        const n = prompt("Nota (cth: no. kes aduan, tarikh adu):", r.note);
                        if (n !== null) start(() => setFakeStatusAction(r.id, r.status, n));
                      }}
                      className="text-xs text-slate-400 hover:text-slate-200"
                    >
                      Nota
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Buang listing ni dari senarai?")) start(() => deleteFakeAction(r.id));
                      }}
                      className="text-xs text-rose-400/70 hover:text-rose-300"
                    >
                      Buang
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
