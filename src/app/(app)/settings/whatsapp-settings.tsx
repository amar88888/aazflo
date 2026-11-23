"use client";

import { useState, useTransition } from "react";
import { saveWhatsAppAction, testWhatsAppAction } from "./actions";
import { Save, Plug, Copy, Check } from "lucide-react";

export function WhatsAppSettings({
  configured,
  webhookUrl,
  verifyToken,
  phoneNumberIdSet,
  appSecretSet,
  displayNumber,
}: {
  configured: boolean;
  webhookUrl: string;
  verifyToken: string | null;
  phoneNumberIdSet: boolean;
  appSecretSet: boolean;
  displayNumber?: string;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    start(async () => {
      const r = await fn();
      setMsg({ ok: r.ok, text: r.message ?? (r.ok ? "Berjaya." : "Gagal.") });
    });
  }

  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <div className="space-y-4">
      <form action={(fd) => run(() => saveWhatsAppAction(fd))} className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Access Token {configured && <span className="text-emerald-600">(tersimpan ✓)</span>}
          </label>
          <input
            name="accessToken"
            type="password"
            placeholder={configured ? "•••••••• (isi untuk tukar)" : "Token system-user / permanent"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Phone Number ID {phoneNumberIdSet && <span className="text-emerald-600">✓</span>}
            </label>
            <input name="phoneNumberId" placeholder="Kosongkan — auto-cari" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">WABA ID (opsyenal)</label>
            <input name="wabaId" placeholder="WhatsApp Business Account ID" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            App Secret {appSecretSet && <span className="text-emerald-600">✓</span>} <span className="text-slate-400">(disyorkan — sahkan webhook)</span>
          </label>
          <input name="appSecret" type="password" placeholder={appSecretSet ? "•••••••• (isi untuk tukar)" : "App Secret dari Meta App → Settings"} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium">
            <Save size={15} /> Simpan
          </button>
          <button type="button" onClick={() => run(testWhatsAppAction)} disabled={pending} className="btn-secondary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50">
            <Plug size={15} /> Test Sambungan
          </button>
        </div>
      </form>

      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>}
      {displayNumber && <p className="text-xs text-slate-500">Nombor: <b>{displayNumber}</b></p>}

      {/* Butiran webhook untuk masuk dalam Meta App */}
      <div className="rounded-lg bg-emerald-50 p-3 text-xs">
        <p className="mb-2 font-medium text-emerald-800">
          Mod relay (disyorkan bila nombor dah guna plugin blast — webhook Meta TAK diubah):
        </p>
        <Field
          label="Relay URL (masuk dalam snippet relay di website plugin)"
          value={verifyToken ? `${webhookUrl}?k=${verifyToken}` : "(Simpan dulu untuk jana)"}
          copied={copied === "relay"}
          onCopy={() => verifyToken && copy(`${webhookUrl}?k=${verifyToken}`, "relay")}
          mono
        />
        <p className="pt-1 text-emerald-700">Rahsia — sesiapa ada URL ni boleh hantar mesej ke inbox. Jangan kongsi.</p>
      </div>

      <div className="rounded-lg bg-slate-50 p-3 text-xs">
        <p className="mb-2 font-medium text-slate-700">Mod terus (hanya kalau token dari app Aazflo) — Meta App → WhatsApp → Webhook:</p>
        <div className="space-y-2">
          <Field label="Callback URL" value={webhookUrl} copied={copied === "url"} onCopy={() => copy(webhookUrl, "url")} />
          <Field
            label="Verify Token"
            value={verifyToken ?? "(Simpan dulu untuk jana)"}
            copied={copied === "vt"}
            onCopy={() => verifyToken && copy(verifyToken, "vt")}
            mono
          />
          <p className="pt-1 text-slate-500">Lepas verify → subscribe field <code className="rounded bg-white px-1">messages</code>.</p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, copied, onCopy, mono }: { label: string; value: string; copied: boolean; onCopy: () => void; mono?: boolean }) {
  return (
    <div>
      <p className="mb-0.5 text-[11px] text-slate-500">{label}</p>
      <div className="flex items-center gap-2">
        <code className={`flex-1 overflow-x-auto rounded border border-slate-200 bg-white px-2 py-1.5 ${mono ? "font-mono" : ""} text-slate-700`}>{value}</code>
        <button type="button" onClick={onCopy} className="flex-shrink-0 rounded border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50">
          {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
        </button>
      </div>
    </div>
  );
}
