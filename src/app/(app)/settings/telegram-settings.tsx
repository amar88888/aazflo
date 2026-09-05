"use client";

import { useState, useTransition } from "react";
import { saveTelegramAction, detectChatIdAction, sendTestReportAction } from "./actions";
import { Send, Search, Save } from "lucide-react";

export function TelegramSettings({ chatIdSet }: { chatIdSet: boolean }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; message?: string; error?: string; chatId?: string }>) {
    start(async () => {
      const r = await fn();
      setMsg({
        ok: r.ok,
        text: r.ok ? r.message ?? (r.chatId ? `Chat ID dikesan: ${r.chatId}` : "Berjaya.") : r.error ?? "Gagal.",
      });
    });
  }

  return (
    <div className="space-y-4">
      <form
        action={(fd) => run(() => saveTelegramAction(fd))}
        className="space-y-3"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Bot Token (dari @BotFather)</label>
          <input
            name="botToken"
            type="password"
            placeholder="123456:ABC-xxxxxxxxxxxxxxxx"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Chat ID {chatIdSet && <span className="text-emerald-600">(sudah diset ✓)</span>}
          </label>
          <input
            name="chatId"
            placeholder="cth: 123456789 (atau guna auto-detect di bawah)"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
        <button className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium">
          <Save size={15} /> Simpan
        </button>
      </form>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => run(detectChatIdAction)}
          disabled={pending}
          className="btn-secondary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          <Search size={15} /> Auto-detect Chat ID
        </button>
        <button
          onClick={() => run(sendTestReportAction)}
          disabled={pending}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          <Send size={15} /> Hantar Report Sekarang (test)
        </button>
      </div>

      {msg && <p className={`text-sm ${msg.ok ? "text-emerald-600" : "text-red-600"}`}>{msg.text}</p>}
    </div>
  );
}
