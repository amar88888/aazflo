"use client";

import { useState, useTransition } from "react";
import { importCsvAction } from "../actions";
import { PageHeader, Card } from "@/components/ui";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export default function ImportPage() {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      const res = await importCsvAction(formData);
      setResult(res);
    });
  }

  return (
    <div className="max-w-xl">
      <Link href="/orders" className="mb-4 flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft size={15} /> Kembali ke Orders
      </Link>
      <PageHeader
        title="Import Order CSV"
        subtitle="Upload fail export order dari TikTok Seller Center atau Shopee Seller Centre"
      />
      <Card>
        <form action={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Platform</label>
            <select
              name="platform"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none"
            >
              <option value="tiktok">TikTok Shop</option>
              <option value="shopee">Shopee</option>
            </select>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Fail CSV</label>
            <input
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1 file:text-sm"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              TikTok: Seller Center → Orders → Export. Shopee: Seller Centre → My Orders → Export.
            </p>
          </div>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg btn-primary px-5 py-2 text-sm font-medium disabled:opacity-50"
          >
            {isPending ? "Sedang import..." : "Import"}
          </button>
          {result && (
            <p className={`text-sm ${result.ok ? "text-emerald-600" : "text-red-600"}`}>{result.message}</p>
          )}
        </form>
      </Card>
    </div>
  );
}
