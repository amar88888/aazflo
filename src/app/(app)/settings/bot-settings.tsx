"use client";

import { useState, useTransition } from "react";
import { saveBotAction, testBotAction } from "./actions";
import { Save, Bot, Send } from "lucide-react";

export function BotSettings({
  enabled,
  hasKey,
  model,
  faq,
}: {
  enabled: boolean;
  hasKey: boolean;
  model: string;
  faq: string;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [testMsg, setTestMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [question, setQuestion] = useState("Berapa harga Facelim? Boleh COD?");
  const [pending, start] = useTransition();

  return (
    <div className="space-y-4">
      <form
        action={(fd) =>
          start(async () => {
            const r = await saveBotAction(fd);
            setMsg({ ok: r.ok, text: r.message });
          })
        }
        className="space-y-3"
      >
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <input type="checkbox" name="enabled" defaultChecked={enabled} className="h-4 w-4 accent-violet-600" />
          Hidupkan bot auto-reply (WhatsApp, Messenger, IG)
        </label>
        <div className="flex flex-wrap gap-3">
          <div className="min-w-[220px] flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Gemini API key {hasKey && <span className="text-emerald-600">(tersimpan ✓)</span>}
            </label>
            <input
              name="geminiKey"
              type="password"
              autoComplete="off"
              placeholder={hasKey ? "•••••••• (isi untuk tukar)" : "AIza…"}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="w-48">
            <label className="mb-1 block text-xs font-medium text-slate-600">Model</label>
            <input name="model" defaultValue={model} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Maklumat kedai untuk bot (COD, caj pos, tempoh sampai, waktu operasi, cara guna, dll)
          </label>
          <textarea
            name="faq"
            defaultValue={faq}
            rows={7}
            placeholder={"Contoh:\n- COD ada untuk Semenanjung, caj COD RM5\n- Pos 2-4 hari bekerja (Semenanjung), 4-7 hari (Sabah/Sarawak)\n- Cara guna Facelim: sapu nipis pagi & malam pada muka yang bersih\n- Waktu operasi staff: 9 pagi - 6 petang"}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <p className="mt-1 text-[11px] text-slate-500">
            Harga produk bot ambil sendiri dari website (sentiasa terkini). Benda yang tiada di sini — bot serahkan kepada staff.
          </p>
        </div>
        <button className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium">
          <Save size={15} /> Simpan
        </button>
      </form>
      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>}

      <div className="rounded-lg bg-violet-50 p-3">
        <p className="mb-2 flex items-center gap-1 text-xs font-medium text-violet-800">
          <Bot size={13} /> Uji bot (tak hantar ke pelanggan)
        </p>
        <div className="flex gap-2">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="flex-1 rounded-lg border border-violet-200 px-3 py-2 text-sm"
          />
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                setTestMsg(null);
                const r = await testBotAction(question);
                setTestMsg({ ok: r.ok, text: r.message });
              })
            }
            className="flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            <Send size={14} /> Uji
          </button>
        </div>
        {testMsg && (
          <p className={`mt-2 whitespace-pre-wrap text-sm ${testMsg.ok ? "text-slate-700" : "text-red-600"}`}>{testMsg.text}</p>
        )}
      </div>
    </div>
  );
}
