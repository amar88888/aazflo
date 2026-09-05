"use client";

import { useState, useTransition } from "react";
import { syncWooCommerceAction } from "./actions";
import { RefreshCw } from "lucide-react";

export function SyncWooButton() {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  return (
    <div>
      <button
        onClick={() =>
          startTransition(async () => {
            const res = await syncWooCommerceAction();
            setResult(res);
          })
        }
        disabled={isPending}
        className="flex items-center gap-2 rounded-lg btn-primary px-4 py-2 text-sm font-medium disabled:opacity-50"
      >
        <RefreshCw size={15} className={isPending ? "animate-spin" : ""} />
        {isPending ? "Sedang sync..." : "Sync Order Sekarang"}
      </button>
      {result && (
        <p className={`mt-2 text-sm ${result.ok ? "text-emerald-600" : "text-red-600"}`}>{result.message}</p>
      )}
    </div>
  );
}
