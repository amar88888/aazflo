"use client";

import { useState, useTransition } from "react";
import { saveWooStoreAction, testWooStoreAction, removeWooStoreAction } from "./actions";
import { Save, Plug, Store, Trash2 } from "lucide-react";

type StoreLite = { key: string; name: string; url: string };

export function WooStoresSettings({ stores }: { stores: StoreLite[] }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function collect(): FormData {
    const fd = new FormData();
    fd.set("key", (document.getElementById("ws_key") as HTMLInputElement)?.value ?? "");
    fd.set("name", (document.getElementById("ws_name") as HTMLInputElement)?.value ?? "");
    fd.set("url", (document.getElementById("ws_url") as HTMLInputElement)?.value ?? "");
    fd.set("user", (document.getElementById("ws_user") as HTMLInputElement)?.value ?? "");
    fd.set("pass", (document.getElementById("ws_pass") as HTMLInputElement)?.value ?? "");
    return fd;
  }

  function test() {
    start(async () => {
      const r = await testWooStoreAction(collect());
      setMsg({ ok: r.ok, text: r.message });
    });
  }
  function save() {
    start(async () => {
      const r = await saveWooStoreAction(collect());
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) {
        for (const id of ["ws_key", "ws_name", "ws_url", "ws_user", "ws_pass"]) {
          const el = document.getElementById(id) as HTMLInputElement | null;
          if (el) el.value = "";
        }
      }
    });
  }
  function remove(key: string) {
    start(async () => {
      await removeWooStoreAction(key);
      setMsg({ ok: true, text: `Kedai "${key}" dibuang.` });
    });
  }

  const input = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";

  return (
    <div className="space-y-4">
      {stores.length > 0 && (
        <div className="space-y-2">
          {stores.map((s) => (
            <div key={s.key} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center gap-2 text-sm">
                <Store size={15} className="text-violet-500" />
                <span className="font-medium text-slate-700">{s.name}</span>
                <span className="font-mono text-xs text-slate-400">{s.url}</span>
              </div>
              <button
                onClick={() => remove(s.key)}
                disabled={pending}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 size={13} /> Buang
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-dashed border-slate-300 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Tambah kedai baru</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <input id="ws_name" placeholder="Nama (cth: Facelim)" className={input} />
          <input id="ws_key" placeholder="Kunci ringkas (cth: facelim)" className={input} />
          <input id="ws_url" placeholder="https://facelim.com" className={`${input} sm:col-span-2`} />
          <input id="ws_user" placeholder="Consumer Key / WP username" className={input} />
          <input id="ws_pass" type="password" placeholder="Consumer Secret / App Password" className={input} />
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={test} disabled={pending} className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            <Plug size={15} /> Test Sambungan
          </button>
          <button onClick={save} disabled={pending} className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
            <Save size={15} /> Simpan Kedai
          </button>
        </div>
      </div>

      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
