"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui";
import { PlatformBadge } from "@/components/platform-icon";
import { formatRM, formatDateTime } from "@/lib/format";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  ORDER_STATUS_LABELS,
  DELIVERY_STATUS_LABELS,
  DELIVERY_STATUS_COLORS,
  RETURN_STATUS_LABELS,
  RETURN_STATUS_COLORS,
  type Platform,
  type OrderStatus,
  type DeliveryStatus,
  type ReturnStatus,
} from "@/lib/constants";
import { markPrintedAction } from "./actions";
import { Printer, Truck, FileText } from "lucide-react";

export type AwbOrder = {
  id: string;
  platform: string;
  platformOrderId: string;
  buyerName: string | null;
  items: string;
  total: number;
  status: string;
  deliveryStatus: string;
  returnStatus: string;
  courier: string | null;
  trackingNo: string | null;
  orderedAt: string;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "red",
  printed: "blue",
  shipped: "orange",
  completed: "green",
  cancelled: "slate",
};

export function AwbOrdersTable({
  orders,
  pendingByPlatform,
  isStaff,
}: {
  orders: AwbOrder[];
  pendingByPlatform: Record<string, number>;
  isStaff: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const headerRef = useRef<HTMLInputElement>(null);

  const allSelected = orders.length > 0 && orders.every((o) => selected.has(o.id));
  const someSelected = orders.some((o) => selected.has(o.id)) && !allSelected;

  useEffect(() => {
    if (headerRef.current) headerRef.current.indeterminate = someSelected;
  }, [someSelected]);

  function toggleAll() {
    setSelected((prev) => {
      const next = new Set(prev);
      if (orders.every((o) => next.has(o.id))) {
        orders.forEach((o) => next.delete(o.id));
      } else {
        orders.forEach((o) => next.add(o.id));
      }
      return next;
    });
  }

  const selectedByPlatform = useMemo(() => {
    const map: Record<string, number> = {};
    for (const o of orders) {
      if (selected.has(o.id)) map[o.platform] = (map[o.platform] ?? 0) + 1;
    }
    return map;
  }, [selected, orders]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function printAwb(payload: { platform: string; scope?: string; orderIds?: string[] }, filenameHint: string) {
    const res = await fetch("/api/awb/print", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      throw new Error(e.error || "Gagal print AWB.");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `AWB-${filenameHint}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function printPending(platform: string) {
    setBusy(true);
    setMsg(null);
    try {
      await printAwb({ platform, scope: "pending" }, `${platform}-pending`);
      setMsg(`AWB ${PLATFORM_LABELS[platform as Platform]} berjaya dijana & ditanda printed.`);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Ralat.");
    } finally {
      setBusy(false);
    }
  }

  async function printSelected() {
    setBusy(true);
    setMsg(null);
    try {
      // Kumpul ikut platform → satu fail PDF setiap platform (TAK bercampur).
      const byPlatform: Record<string, string[]> = {};
      for (const o of orders) {
        if (selected.has(o.id)) (byPlatform[o.platform] ??= []).push(o.id);
      }
      const platforms = Object.keys(byPlatform);
      for (const p of platforms) {
        await printAwb({ platform: p, orderIds: byPlatform[p] }, `${p}-${byPlatform[p].length}`);
      }
      setMsg(
        platforms.length > 1
          ? `${platforms.length} fail AWB berasingan dijana (satu per platform).`
          : "AWB berjaya dijana & ditanda printed."
      );
      setSelected(new Set());
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Ralat.");
    } finally {
      setBusy(false);
    }
  }

  const platformsWithPending = PLATFORMS.filter((p) => (pendingByPlatform[p] ?? 0) > 0);

  return (
    <div>
      {/* Bulk print per platform (SATU platform satu fail) */}
      {platformsWithPending.length > 0 && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white/70 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Print AWB pukal — setiap platform fail berasingan
          </p>
          <div className="flex flex-wrap gap-3">
            {platformsWithPending.map((p) => (
              <button
                key={p}
                onClick={() => printPending(p)}
                disabled={busy}
                className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                <Printer size={15} /> Print {pendingByPlatform[p]} AWB {PLATFORM_LABELS[p]}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Toolbar bila ada order dipilih */}
      {selected.size > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-300 bg-violet-50 px-4 py-3">
          <div className="text-sm text-violet-900">
            <span className="font-semibold">{selected.size} order dipilih</span>
            {Object.keys(selectedByPlatform).length > 0 && (
              <span className="ml-2 text-violet-700">
                (
                {Object.entries(selectedByPlatform)
                  .map(([p, n]) => `${PLATFORM_LABELS[p as Platform]}: ${n}`)
                  .join(" · ")}
                )
              </span>
            )}
            {Object.keys(selectedByPlatform).length > 1 && (
              <span className="ml-2 text-xs text-violet-600">→ akan jadi fail berasingan per platform</span>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setSelected(new Set())} className="rounded-lg px-3 py-1.5 text-sm text-slate-600 hover:bg-white">
              Batal
            </button>
            <button onClick={printSelected} disabled={busy} className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
              <Printer size={15} /> {busy ? "Menjana..." : "Print AWB dipilih"}
            </button>
          </div>
        </div>
      )}

      {msg && <p className="mb-3 text-sm text-emerald-600">{msg}</p>}

      <div className="overflow-x-auto rounded-2xl border border-white/60 bg-white/85 shadow-sm backdrop-blur-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">
                <input
                  ref={headerRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  title="Pilih semua"
                  className="h-4 w-4 rounded border-slate-300 accent-violet-600"
                />
              </th>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Platform</th>
              <th className="px-4 py-3">Item</th>
              {!isStaff && <th className="px-4 py-3 text-right">Total</th>}
              <th className="px-4 py-3">Status AWB</th>
              <th className="px-4 py-3">Penghantaran</th>
              <th className="px-4 py-3">Masa Order</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(o.id)}
                    onChange={() => toggle(o.id)}
                    className="h-4 w-4 rounded border-slate-300 accent-violet-600"
                  />
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{o.platformOrderId}</p>
                  {o.buyerName && <p className="text-xs text-slate-400">{o.buyerName}</p>}
                  {o.trackingNo && (
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                      <Truck size={12} />
                      <span className="font-medium">{o.courier}</span>
                      <span className="font-mono text-slate-400">{o.trackingNo}</span>
                    </p>
                  )}
                </td>
                <td className="px-4 py-3">
                  <PlatformBadge platform={o.platform as Platform} />
                </td>
                <td className="px-4 py-3 text-slate-600">{o.items || "-"}</td>
                {!isStaff && <td className="px-4 py-3 text-right font-medium">{formatRM(o.total)}</td>}
                <td className="px-4 py-3">
                  <Badge color={STATUS_COLORS[o.status]}>
                    {ORDER_STATUS_LABELS[o.status as OrderStatus] ?? o.status}
                  </Badge>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <Badge color={DELIVERY_STATUS_COLORS[o.deliveryStatus as DeliveryStatus] ?? "slate"}>
                      {DELIVERY_STATUS_LABELS[o.deliveryStatus as DeliveryStatus] ?? o.deliveryStatus}
                    </Badge>
                    {o.returnStatus !== "none" && (
                      <Badge color={RETURN_STATUS_COLORS[o.returnStatus as ReturnStatus] ?? "orange"}>
                        ↩ {RETURN_STATUS_LABELS[o.returnStatus as ReturnStatus] ?? o.returnStatus}
                      </Badge>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-500">{formatDateTime(o.orderedAt)}</td>
                <td className="px-4 py-3">
                  {o.status === "pending" && (
                    <form action={markPrintedAction.bind(null, o.id)}>
                      <button
                        type="submit"
                        className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        ✓ Printed
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
