"use client";

import { useState } from "react";
import { logSlotResultAction } from "./actions";

export function LogResultForm({ slotId }: { slotId: string }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 text-xs font-medium text-blue-600 hover:underline"
      >
        + Log hasil sesi ni
      </button>
    );
  }

  return (
    <form action={logSlotResultAction} className="mt-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="slotId" value={slotId} />
      <div>
        <label className="mb-1 block text-xs text-slate-500">Sales (RM)</label>
        <input name="salesTotal" type="number" step="0.01" min="0" className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-500">Peak viewers</label>
        <input name="peakViewers" type="number" min="0" className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </div>
      <div className="flex-1">
        <label className="mb-1 block text-xs text-slate-500">Nota</label>
        <input name="notes" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
      </div>
      <button type="submit" className="btn-primary rounded-lg px-4 py-1.5 text-sm font-medium">
        Simpan
      </button>
    </form>
  );
}
