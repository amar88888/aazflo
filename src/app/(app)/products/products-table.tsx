"use client";

import { useState } from "react";
import { updateProductInlineAction, deleteProductAction } from "./actions";
import { formatRM } from "@/lib/format";
import { Pencil, Trash2, X } from "lucide-react";

export type ProductRow = {
  id: string;
  name: string;
  sku: string;
  cogsPerUnit: number;
  priceTiktok: number | null;
  priceShopee: number | null;
  priceWoo: number | null;
  tiktokSku: string | null;
  shopeeSku: string | null;
  wooSku: string | null;
};

export function ProductsTable({ products }: { products: ProductRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
          <th className="px-5 py-2.5">Produk</th>
          <th className="px-5 py-2.5">SKU</th>
          <th className="px-5 py-2.5 text-right">TikTok</th>
          <th className="px-5 py-2.5 text-right">Shopee</th>
          <th className="px-5 py-2.5 text-right">Website</th>
          <th className="px-5 py-2.5 text-right">COGS/unit</th>
          <th className="px-5 py-2.5"></th>
        </tr>
      </thead>
      <tbody>
        {products.map((p) =>
          editingId === p.id ? (
            <tr key={p.id} className="border-b border-slate-100 bg-violet-50/60">
              <td colSpan={7} className="px-5 py-3">
                <form
                  action={async (fd) => {
                    await updateProductInlineAction(fd);
                    setEditingId(null);
                  }}
                  className="flex flex-wrap items-end gap-3"
                >
                  <input type="hidden" name="id" value={p.id} />
                  <div className="min-w-40 flex-1">
                    <p className="text-sm font-medium text-slate-800">{p.name}</p>
                    <p className="font-mono text-xs text-slate-500">{p.sku}</p>
                  </div>
                  {(
                    [
                      ["priceTiktok", "TikTok (RM)", p.priceTiktok],
                      ["priceShopee", "Shopee (RM)", p.priceShopee],
                      ["priceWoo", "Website (RM)", p.priceWoo],
                      ["cogsPerUnit", "COGS (RM)", p.cogsPerUnit],
                    ] as const
                  ).map(([name, label, val]) => (
                    <div key={name}>
                      <label className="mb-1 block text-xs text-slate-500">{label}</label>
                      <input
                        name={name}
                        type="number"
                        step="0.01"
                        min="0"
                        defaultValue={val ?? ""}
                        placeholder="—"
                        className="w-28 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                      />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button type="submit" className="btn-primary rounded-lg px-4 py-1.5 text-sm font-medium">
                      Simpan
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-white"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </form>
              </td>
            </tr>
          ) : (
            <tr key={p.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
              <td className="px-5 py-3 font-medium text-slate-800">{p.name}</td>
              <td className="px-5 py-3">
                <p className="font-mono text-xs text-slate-600">{p.sku}</p>
              </td>
              <td className="px-5 py-3 text-right">
                {p.priceTiktok != null ? formatRM(p.priceTiktok) : <span className="text-slate-300">—</span>}
              </td>
              <td className="px-5 py-3 text-right">
                {p.priceShopee != null ? formatRM(p.priceShopee) : <span className="text-slate-300">—</span>}
              </td>
              <td className="px-5 py-3 text-right">
                {p.priceWoo != null ? formatRM(p.priceWoo) : <span className="text-slate-300">—</span>}
              </td>
              <td className="px-5 py-3 text-right font-medium">
                {p.cogsPerUnit > 0 ? formatRM(p.cogsPerUnit) : <span className="text-xs text-amber-600">belum isi</span>}
              </td>
              <td className="px-5 py-3">
                <div className="flex items-center justify-end gap-2">
                  <button
                    onClick={() => setEditingId(p.id)}
                    className="flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    title="Edit harga & COGS"
                  >
                    <Pencil size={12} /> Edit
                  </button>
                  <form action={deleteProductAction.bind(null, p.id)}>
                    <button className="text-slate-400 hover:text-red-600" title="Padam">
                      <Trash2 size={15} />
                    </button>
                  </form>
                </div>
              </td>
            </tr>
          )
        )}
        {products.length === 0 && (
          <tr>
            <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
              Belum ada produk — tambah guna borang di sebelah
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
