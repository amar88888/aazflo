"use client";

import { useEffect, useRef, useState, useTransition, useCallback } from "react";
import { Send, Search, RefreshCw, Check, CheckCheck, AlertTriangle, MessageCircle } from "lucide-react";
import { listConversations, getThread, sendReply, type Conversation, type ThreadMessage } from "./actions";

function timeShort(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay
    ? d.toLocaleTimeString("ms-MY", { hour: "2-digit", minute: "2-digit", hour12: false })
    : d.toLocaleDateString("ms-MY", { day: "2-digit", month: "short" });
}

function StatusTick({ status }: { status: string | null }) {
  if (status === "read") return <CheckCheck size={13} className="text-sky-500" />;
  if (status === "delivered") return <CheckCheck size={13} className="text-slate-400" />;
  if (status === "failed") return <AlertTriangle size={13} className="text-red-500" />;
  if (status === "sent") return <Check size={13} className="text-slate-400" />;
  return null;
}

export function InboxClient({ initial }: { initial: Conversation[] }) {
  const [convos, setConvos] = useState<Conversation[]>(initial);
  const [selId, setSelId] = useState<string | null>(initial[0]?.id ?? null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [sel, setSel] = useState<Conversation | null>(initial[0] ?? null);
  const [windowOpen, setWindowOpen] = useState<boolean>(initial[0]?.windowOpen ?? false);
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshList = useCallback(async () => {
    const c = await listConversations();
    setConvos(c);
    setSel((prev) => c.find((x) => x.id === prev?.id) ?? prev);
    const cur = c.find((x) => x.id === selId);
    if (cur) setWindowOpen(cur.windowOpen);
  }, [selId]);

  const openThread = useCallback(async (id: string) => {
    setSelId(id);
    setErr(null);
    const { contact, messages } = await getThread(id);
    setThread(messages);
    if (contact) setWindowOpen(contact.windowOpen);
    setConvos((prev) => prev.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    setSel((prev) => prev ?? null);
  }, []);

  // Buka chat pertama pada mula
  useEffect(() => {
    if (selId) openThread(selId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh tiap 8 saat (senarai + thread terbuka)
  useEffect(() => {
    const t = setInterval(async () => {
      await refreshList();
      if (selId) {
        const { messages, contact } = await getThread(selId);
        setThread(messages);
        if (contact) setWindowOpen(contact.windowOpen);
      }
    }, 8000);
    return () => clearInterval(t);
  }, [selId, refreshList]);

  // Scroll ke bawah bila thread berubah
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [thread, selId]);

  function pick(c: Conversation) {
    setSel(c);
    setDraft("");
    openThread(c.id);
  }

  function submit() {
    const text = draft.trim();
    if (!text || !selId) return;
    setErr(null);
    // optimistik
    const temp: ThreadMessage = {
      id: "tmp-" + Date.now(),
      direction: "out",
      body: text,
      type: "text",
      status: "sent",
      error: null,
      timestamp: new Date().toISOString(),
    };
    setThread((p) => [...p, temp]);
    setDraft("");
    start(async () => {
      const r = await sendReply(selId, text);
      if (!r.ok) {
        setErr(r.error ?? "Gagal hantar.");
        setThread((p) => p.map((m) => (m.id === temp.id ? { ...m, status: "failed", error: r.error ?? "" } : m)));
      } else {
        const { messages } = await getThread(selId);
        setThread(messages);
        refreshList();
      }
    });
  }

  const filtered = convos.filter(
    (c) => !q || (c.name ?? "").toLowerCase().includes(q.toLowerCase()) || c.waId.includes(q),
  );
  const totalUnread = convos.reduce((s, c) => s + c.unread, 0);

  return (
    <div className="flex h-[calc(100vh-9rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Senarai perbualan */}
      <div className={`flex w-full flex-col border-r border-slate-200 sm:w-80 ${selId ? "hidden sm:flex" : "flex"}`}>
        <div className="border-b border-slate-100 p-3">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama / nombor…"
              className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-sm"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <p className="p-6 text-center text-sm text-slate-400">Belum ada perbualan.</p>
          )}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => pick(c)}
              className={`flex w-full items-start gap-3 border-b border-slate-50 px-3 py-3 text-left transition-colors hover:bg-slate-50 ${
                selId === c.id ? "bg-indigo-50/60" : ""
              }`}
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-sm font-semibold text-white">
                {(c.name ?? c.waId).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">{c.name || `+${c.waId}`}</span>
                  <span className="flex-shrink-0 text-[11px] text-slate-400">{timeShort(c.lastMessageAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-slate-500">
                    {c.lastDirection === "out" ? "Awak: " : ""}
                    {c.preview}
                  </span>
                  {c.unread > 0 && (
                    <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-semibold text-white">
                      {c.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
        <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">
          {convos.length} perbualan{totalUnread > 0 ? ` · ${totalUnread} belum baca` : ""}
        </div>
      </div>

      {/* Thread */}
      <div className={`flex min-w-0 flex-1 flex-col ${selId ? "flex" : "hidden sm:flex"}`}>
        {!sel ? (
          <div className="flex flex-1 flex-col items-center justify-center text-slate-400">
            <MessageCircle size={40} className="mb-2 opacity-40" />
            <p className="text-sm">Pilih satu perbualan untuk balas.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
              <button onClick={() => setSelId(null)} className="text-slate-400 sm:hidden">←</button>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-xs font-semibold text-white">
                {(sel.name ?? sel.waId).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{sel.name || `+${sel.waId}`}</p>
                <p className="text-xs text-slate-400">+{sel.waId}</p>
              </div>
              <span
                className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  windowOpen ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                }`}
              >
                {windowOpen ? "Boleh balas (24j)" : "Tetingkap tutup"}
              </span>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-4 py-4">
              {thread.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                      m.direction === "out"
                        ? "rounded-br-sm bg-emerald-500 text-white"
                        : "rounded-bl-sm bg-white text-slate-800"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <div className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${m.direction === "out" ? "text-emerald-100" : "text-slate-400"}`}>
                      <span>{timeShort(m.timestamp)}</span>
                      {m.direction === "out" && <StatusTick status={m.status} />}
                    </div>
                    {m.error && <p className="mt-0.5 text-[10px] text-red-200">{m.error}</p>}
                  </div>
                </div>
              ))}
              {thread.length === 0 && <p className="py-8 text-center text-sm text-slate-400">Tiada mesej.</p>}
            </div>

            <div className="border-t border-slate-200 p-3">
              {!windowOpen && (
                <p className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  ⚠️ Dah lebih 24 jam sejak pelanggan mesej. Balasan free-form akan ditolak Meta — perlu template berbayar.
                </p>
              )}
              {err && <p className="mb-2 text-xs text-red-600">{err}</p>}
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                  rows={1}
                  placeholder={windowOpen ? "Taip balasan… (Enter hantar)" : "Tetingkap 24 jam tutup"}
                  className="max-h-32 min-h-[42px] flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2.5 text-sm"
                />
                <button
                  onClick={submit}
                  disabled={pending || !draft.trim()}
                  className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500 text-white transition-colors hover:bg-emerald-600 disabled:opacity-40"
                >
                  {pending ? <RefreshCw size={17} className="animate-spin" /> : <Send size={17} />}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
