"use client";

import { useState, useTransition } from "react";
import { saveMetaAction, testMetaAction } from "./actions";
import { Save, Plug } from "lucide-react";

export function MetaSettings({ hasToken, adAccountId }: { hasToken: boolean; adAccountId: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save(fd: FormData) {
    start(async () => {
      await saveMetaAction(fd);
      setMsg({ ok: true, text: "Disimpan. Tekan Test untuk sahkan sambungan." });
    });
  }

  function test() {
    start(async () => {
      const r = await testMetaAction();
      setMsg({ ok: r.ok, text: r.message });
    });
  }

  return (
    <div className="space-y-4">
      <form action={save} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Access Token {hasToken && <span className="text-emerald-600">(dah disimpan ✓)</span>}
          </label>
          <input
            name="accessToken"
            type="password"
            placeholder={hasToken ? "•••••••• (isi untuk tukar)" : "EAAG... (token ads_read)"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Ad Account ID</label>
          <input
            name="adAccountId"
            defaultValue={adAccountId}
            placeholder="act_1234567890"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          disabled={pending}
          className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          <Save size={15} /> Simpan
        </button>
      </form>

      <button
        onClick={test}
        disabled={pending}
        className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        <Plug size={15} /> Test Sambungan
      </button>

      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
