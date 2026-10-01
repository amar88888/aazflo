"use client";

import { useState, useTransition } from "react";
import { saveMetaAction, testMetaAction } from "./actions";
import { Save, Plug } from "lucide-react";

export function MetaSettings({
  hasToken,
  adAccountId,
  hasAppSecret,
  appId,
}: {
  hasToken: boolean;
  adAccountId: string;
  hasAppSecret: boolean;
  appId: string;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save(fd: FormData) {
    start(async () => {
      const r = await saveMetaAction(fd);
      setMsg({ ok: r?.ok ?? true, text: r?.message ?? "Disimpan. Tekan Test untuk sahkan." });
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
        <div className="rounded-lg bg-violet-50 p-3">
          <p className="mb-2 text-xs font-medium text-violet-700">
            🔒 Token kekal (auto-renew) — isi App ID + App Secret supaya token tak expire lagi
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input
              name="appId"
              defaultValue={appId}
              placeholder="App ID (cth 1628709562096006)"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="appSecret"
              type="password"
              placeholder={hasAppSecret ? "•••••••• (dah ada ✓)" : "App Secret"}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
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
