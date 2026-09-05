"use client";

import { Fragment, useState } from "react";
import { Badge } from "@/components/ui";
import { PlatformBadge } from "@/components/platform-icon";
import { formatRM, formatDateTime } from "@/lib/format";
import {
  RETURN_STATUSES,
  RETURN_STATUS_LABELS,
  RETURN_STATUS_COLORS,
  type Platform,
  type ReturnStatus,
} from "@/lib/constants";
import { updateReturnAction, markCancelAction, clearReturnAction } from "./actions";

export type ReturnRow = {
  id: string;
  platformOrderId: string;
  buyerName: string | null;
  platform: string;
  total: number;
  refundAmount: number;
  returnStatus: string;
  returnReason: string | null;
  status: string;
  orderedAt: string;
  kind: "return" | "cancel";
  itemsSummary: string;
};

export function ReturnsTable({ rows }: { rows: ReturnRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-14 text-center">
        <p className="text-sm font-medium text-slate-700">Takde return atau order batal setakat ni 🎉</p>
        <p className="mt-1 text-xs text-slate-500">
          Order yang di-refund/batal akan muncul di sini. Boleh rekod manual guna borang di atas.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            <th className="pb-2 pl-1">Order / Pembeli</th>
            <th className="pb-2">Platform</th>
            <th className="pb-2">Jenis</th>
            <th className="pb-2">Status</th>
            <th className="pb-2 text-right">Jumlah</th>
            <th className="pb-2 text-right">Refund</th>
            <th className="pb-2 text-right">Tarikh</th>
            <th className="pb-2 text-right pr-1"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const open = openId === r.id;
            return (
              <Fragment key={r.id}>
                <tr className="border-b border-slate-100 hover:bg-slate-50/70">
                  <td className="py-2.5 pl-1">
                    <p className="font-medium text-slate-800">{r.platformOrderId}</p>
                    <p className="text-xs text-slate-400">{r.buyerName ?? "-"} · {r.itemsSummary}</p>
                  </td>
                  <td className="py-2.5">
                    <PlatformBadge platform={r.platform as Platform} size={16} />
                  </td>
                  <td className="py-2.5">
                    {r.kind === "cancel" ? (
                      <Badge color="slate">Batal</Badge>
                    ) : (
                      <Badge color="orange">Return</Badge>
                    )}
                  </td>
                  <td className="py-2.5">
                    {r.kind === "cancel" ? (
                      <span className="text-xs text-slate-500">Order dibatalkan</span>
                    ) : (
                      <Badge color={RETURN_STATUS_COLORS[r.returnStatus as ReturnStatus] ?? "slate"}>
                        {RETURN_STATUS_LABELS[r.returnStatus as ReturnStatus] ?? r.returnStatus}
                      </Badge>
                    )}
                  </td>
                  <td className="py-2.5 text-right text-slate-600">{formatRM(r.total)}</td>
                  <td className="py-2.5 text-right font-semibold text-red-600">
                    {r.refundAmount > 0 ? `-${formatRM(r.refundAmount)}` : "—"}
                  </td>
                  <td className="py-2.5 text-right text-xs text-slate-500">{formatDateTime(r.orderedAt)}</td>
                  <td className="py-2.5 pr-1 text-right">
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : r.id)}
                      className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      {open ? "Tutup" : "Urus"}
                    </button>
                  </td>
                </tr>
                {open && (
                  <tr className="bg-slate-50/80">
                    <td colSpan={8} className="px-1 py-3">
                      {r.returnReason && (
                        <p className="mb-2 text-xs text-slate-500">
                          Sebab sekarang: <span className="font-medium text-slate-700">{r.returnReason}</span>
                        </p>
                      )}
                      <form action={updateReturnAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="orderId" value={r.id} />
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">Status Return</label>
                          <select
                            name="returnStatus"
                            defaultValue={r.returnStatus === "none" ? "requested" : r.returnStatus}
                            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          >
                            {RETURN_STATUSES.filter((s) => s !== "none").map((s) => (
                              <option key={s} value={s}>{RETURN_STATUS_LABELS[s]}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">Refund (RM)</label>
                          <input
                            type="number"
                            step="0.01"
                            name="refundAmount"
                            defaultValue={r.refundAmount || ""}
                            placeholder="0.00"
                            className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <div className="min-w-[180px] flex-1">
                          <label className="mb-1 block text-[11px] font-medium text-slate-500">Sebab return</label>
                          <input
                            type="text"
                            name="returnReason"
                            defaultValue={r.returnReason ?? ""}
                            placeholder="Cth: Barang rosak / salah saiz"
                            className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                          />
                        </div>
                        <button type="submit" className="btn-primary rounded-lg px-4 py-1.5 text-sm font-semibold">
                          Simpan
                        </button>
                      </form>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {r.kind !== "cancel" && r.status !== "cancelled" && (
                          <form action={markCancelAction}>
                            <input type="hidden" name="orderId" value={r.id} />
                            <button type="submit" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                              Tandakan Batal
                            </button>
                          </form>
                        )}
                        {r.kind === "return" && (
                          <form action={clearReturnAction}>
                            <input type="hidden" name="orderId" value={r.id} />
                            <button type="submit" className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100">
                              Buang tanda return
                            </button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
