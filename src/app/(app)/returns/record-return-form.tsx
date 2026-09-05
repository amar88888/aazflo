"use client";

import { useActionState } from "react";
import { recordReturnByOrderNoAction } from "./actions";

type State = { ok: boolean; message: string } | null;

export function RecordReturnForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: State, formData: FormData) => recordReturnByOrderNoAction(formData),
    null
  );

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-500">No. Order</label>
        <input
          name="orderNo"
          required
          placeholder="Cth: TT-1023"
          className="w-40 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <div>
        <label className="mb-1 block text-[11px] font-medium text-slate-500">Refund (RM)</label>
        <input
          type="number"
          step="0.01"
          name="refund"
          placeholder="0.00"
          className="w-28 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <div className="min-w-[180px] flex-1">
        <label className="mb-1 block text-[11px] font-medium text-slate-500">Sebab</label>
        <input
          name="reason"
          placeholder="Cth: Barang rosak / salah saiz"
          className="w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="btn-primary rounded-lg px-4 py-1.5 text-sm font-semibold disabled:opacity-60"
      >
        {pending ? "Merekod..." : "Rekod Return"}
      </button>
      {state && (
        <p className={`w-full text-xs font-medium ${state.ok ? "text-emerald-600" : "text-red-600"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
