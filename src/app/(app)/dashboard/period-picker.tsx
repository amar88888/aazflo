"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Active = { kind: "date" | "month" | "year"; value: string } | null;

export function PeriodPicker({ active }: { active: Active }) {
  const router = useRouter();
  const [mode, setMode] = useState<"date" | "month" | "year">(active?.kind ?? "date");
  const yearNow = new Date().getFullYear();

  function go(kind: string, value: string) {
    if (value) router.push(`/dashboard?${kind}=${value}`);
  }

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-xs backdrop-blur">
        {(["date", "month", "year"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md px-2 py-1 font-medium transition-colors ${
              mode === m ? "text-white" : "text-slate-300 hover:bg-white/10"
            }`}
            style={mode === m ? { background: "rgb(var(--m2-rgb))" } : undefined}
          >
            {m === "date" ? "Tarikh" : m === "month" ? "Bulan" : "Tahun"}
          </button>
        ))}
      </div>

      {mode === "date" && (
        <input
          type="date"
          defaultValue={active?.kind === "date" ? active.value : ""}
          onChange={(e) => go("date", e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
      )}
      {mode === "month" && (
        <input
          type="month"
          defaultValue={active?.kind === "month" ? active.value : ""}
          onChange={(e) => go("month", e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
      )}
      {mode === "year" && (
        <select
          defaultValue={active?.kind === "year" ? active.value : String(yearNow)}
          onChange={(e) => go("year", e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        >
          {Array.from({ length: 6 }, (_, i) => yearNow - i).map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
