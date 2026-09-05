"use client";

import { useActionState, useState } from "react";
import { generateVideoAction, type GenState } from "./actions";

type ProductOpt = { name: string };

const DEFAULT_PROMPT =
  "Iklan produk sinematik, kamera perlahan push-in, cahaya studio lembut, highlight berkilat, produk kecantikan premium, gaya vertikal 9:16";

export function ContentForm({ products }: { products: ProductOpt[] }) {
  const [state, formAction, pending] = useActionState<GenState, FormData>(
    async (prev, fd) => generateVideoAction(prev, fd),
    null
  );
  const [productName, setProductName] = useState(products[0]?.name ?? "");

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <form action={formAction} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Produk</label>
          <select
            name="productName"
            value={productName}
            onChange={(e) => setProductName(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {products.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">URL Gambar Produk</label>
          <input
            name="imageUrl"
            required
            placeholder="https://maxlim.shop/.../gambar-produk.jpg"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-xs text-slate-400">
            Copy link gambar produk (klik kanan gambar kat website → Copy image address).
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Prompt (huraian video)</label>
          <textarea
            name="prompt"
            required
            rows={4}
            defaultValue={DEFAULT_PROMPT}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">Kualiti / Kelajuan</label>
          <select name="model" defaultValue="dop-turbo" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
            <option value="dop-lite">Lite (paling laju)</option>
            <option value="dop-turbo">Turbo (seimbang) — disyorkan</option>
            <option value="dop-standard">Standard (kualiti tinggi, lebih lama)</option>
          </select>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="btn-primary w-full rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
        >
          {pending ? "Menjana video... (tunggu, jangan tutup)" : "🎬 Jana Video"}
        </button>

        {state && !state.ok && <p className="text-sm font-medium text-red-600">{state.message}</p>}
      </form>

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Hasil</label>
        <div className="flex min-h-[280px] items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
          {pending ? (
            <p className="text-center text-sm text-slate-500">
              Video sedang dijana oleh AI…<br />
              <span className="text-xs text-slate-400">Ambil masa beberapa saat hingga minit</span>
            </p>
          ) : state?.ok && state.videoUrl ? (
            <div className="w-full space-y-3">
              <video src={state.videoUrl} controls className="w-full rounded-lg bg-black" />
              <div className="flex flex-wrap gap-2">
                <a href={state.videoUrl} target="_blank" rel="noreferrer" className="btn-secondary rounded-lg px-3 py-1.5 text-xs font-semibold">
                  ▶️ Buka / Download
                </a>
                <span className="inline-flex items-center rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700">
                  ✓ Dihantar ke Telegram (jika bot di-setup)
                </span>
              </div>
              <p className="text-xs text-slate-400">Link Higgsfield sah ~7 hari — download & simpan kalau perlu.</p>
            </div>
          ) : (
            <p className="text-center text-sm text-slate-400">Video yang dijana akan muncul di sini</p>
          )}
        </div>
      </div>
    </div>
  );
}
