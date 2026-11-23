"use client";

import { useEffect, useRef, useState, useTransition, useCallback } from "react";
import {
  Send,
  Search,
  RefreshCw,
  Check,
  CheckCheck,
  AlertTriangle,
  MessageCircle,
  CircleCheck,
  RotateCcw,
  Bot,
  Hand,
} from "lucide-react";
import { listConversations, getThread, sendReply, setDone, setBot, type Conversation, type ThreadMessage } from "./actions";

type Tab = "belum" | "dibalas" | "selesai" | "semua";
const TABS: { key: Tab; label: string }[] = [
  { key: "belum", label: "Belum balas" },
  { key: "dibalas", label: "Dibalas" },
  { key: "selesai", label: "Selesai" },
  { key: "semua", label: "Semua" },
];
type Ch = "all" | "whatsapp" | "messenger" | "instagram";
const CHANNELS: { key: Ch; label: string }[] = [
  { key: "all", label: "Semua" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "messenger", label: "Messenger" },
  { key: "instagram", label: "IG DM" },
];
const CH_STYLE: Record<string, { dot: string; label: string; avatar: string }> = {
  whatsapp: { dot: "bg-emerald-500", label: "WhatsApp", avatar: "from-emerald-400 to-teal-500" },
  messenger: { dot: "bg-blue-500", label: "Messenger", avatar: "from-blue-400 to-indigo-500" },
  instagram: { dot: "bg-pink-500", label: "Instagram", avatar: "from-pink-400 to-orange-400" },
};

function inTab(c: Conversation, t: Tab) {
  if (t === "semua") return true;
  if (t === "selesai") return c.done;
  if (c.done) return false;
  // "Perlu manusia" sentiasa dalam Belum balas walaupun bot dah jawab
  const pending = c.needsHuman || c.lastDirection !== "out";
  return t === "belum" ? pending : !pending;
}

function ident(c: { waId: string; channel: string }) {
  return c.channel === "whatsapp" ? `+${c.waId}` : CH_STYLE[c.channel]?.label ?? c.channel;
}

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
  if (status === "read") return <CheckCheck size={13} className="text-sky-200" />;
  if (status === "delivered") return <CheckCheck size={13} className="opacity-80" />;
  if (status === "failed") return <AlertTriangle size={13} className="text-red-200" />;
  if (status === "sent") return <Check size={13} className="opacity-80" />;
  return null;
}

export function InboxClient({ initial }: { initial: Conversation[] }) {
  const [convos, setConvos] = useState<Conversation[]>(initial);
  const [selId, setSelId] = useState<string | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [sel, setSel] = useState<Conversation | null>(null);
  const [windowOpen, setWindowOpen] = useState<boolean>(false);
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("belum");
  const [ch, setCh] = useState<Ch>("all");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  const refreshList = useCallback(async () => {
    const c = await listConversations();
    setConvos(c);
    setSel((prev) => (prev ? (c.find((x) => x.id === prev.id) ?? prev) : prev));
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

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [thread, selId]);

  function pick(c: Conversation) {
    setSel(c);
    setDraft("");
    openThread(c.id);
  }

  function patchSel(p: Partial<Conversation>) {
    if (!sel) return;
    setSel({ ...sel, ...p });
    setConvos((list) => list.map((c) => (c.id === sel.id ? { ...c, ...p } : c)));
  }

  function submit() {
    const text = draft.trim();
    if (!text || !selId) return;
    setErr(null);
    const temp: ThreadMessage = {
      id: "tmp-" + Date.now(),
      direction: "out",
      body: text,
      type: "text",
      status: "sent",
      error: null,
      bot: false,
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
        patchSel({ botPaused: true, needsHuman: false, lastDirection: "out" });
        const { messages } = await getThread(selId);
        setThread(messages);
        refreshList();
      }
    });
  }

  function toggleDone() {
    if (!sel) return;
    const done = !sel.done;
    patchSel({ done, ...(done ? { unread: 0, needsHuman: false } : {}) });
    start(async () => {
      await setDone(sel.id, done);
      refreshList();
    });
  }

  function toggleBot() {
    if (!sel) return;
    const on = sel.botPaused; // sekarang OFF → hidupkan
    patchSel({ botPaused: !on, ...(on ? { needsHuman: false } : {}) });
    start(async () => {
      await setBot(sel.id, on);
      refreshList();
    });
  }

  const byCh = convos.filter((c) => ch === "all" || c.channel === ch);
  const filtered = byCh.filter(
    (c) =>
      inTab(c, tab) &&
      (!q || (c.name ?? "").toLowerCase().includes(q.toLowerCase()) || c.waId.includes(q)),
  );
  const needHumanCount = convos.filter((c) => c.needsHuman && !c.done).length;

  return (
    <div className="flex h-[calc(100vh-9rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Senarai perbualan */}
      <div className={`flex w-full flex-col border-r border-slate-200 sm:w-[22rem] ${selId ? "hidden sm:flex" : "flex"}`}>
        <div className="flex border-b border-slate-100 text-xs">
          {TABS.map((t) => {
            const n = byCh.filter((c) => inTab(c, t.key)).length;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 border-b-2 px-1 py-2.5 font-medium transition-colors ${
                  tab === t.key ? "border-emerald-500 text-emerald-600" : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
                <span className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${tab === t.key ? "bg-emerald-50" : "bg-slate-100"}`}>{n}</span>
              </button>
            );
          })}
        </div>
        <div className="space-y-2 border-b border-slate-100 p-3">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari nama / nombor…"
              className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-sm"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CHANNELS.map((c) => {
              const n = c.key === "all" ? convos.length : convos.filter((x) => x.channel === c.key).length;
              return (
                <button
                  key={c.key}
                  onClick={() => setCh(c.key)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    ch === c.key ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {c.key !== "all" && <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${CH_STYLE[c.key].dot}`} />}
                  {c.label} <span className="text-slate-400">{n}</span>
                </button>
              );
            })}
          </div>
          {needHumanCount > 0 && (
            <p className="flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1.5 text-[11px] font-medium text-amber-700">
              <Hand size={12} /> {needHumanCount} perbualan perlu manusia
            </p>
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && <p className="p-6 text-center text-sm text-slate-400">Tiada perbualan di sini.</p>}
          {filtered.map((c) => (
            <button
              key={c.id}
              onClick={() => pick(c)}
              className={`flex w-full items-start gap-3 border-b border-slate-50 px-3 py-3 text-left transition-colors hover:bg-slate-50 ${
                selId === c.id ? "bg-indigo-50/60" : ""
              }`}
            >
              <div className="relative flex-shrink-0">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${CH_STYLE[c.channel]?.avatar ?? CH_STYLE.whatsapp.avatar} text-sm font-semibold text-white`}
                >
                  {(c.name ?? c.waId.replace(/^(fb|ig):/, "")).slice(0, 2).toUpperCase()}
                </div>
                <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${CH_STYLE[c.channel]?.dot ?? "bg-slate-400"}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-slate-800">{c.name || ident(c)}</span>
                  <span className="flex-shrink-0 text-[11px] text-slate-400">{timeShort(c.lastMessageAt)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-slate-500">
                    {c.lastDirection === "out" ? (c.lastBot ? "🤖 " : "Awak: ") : ""}
                    {c.preview}
                  </span>
                  {c.unread > 0 && (
                    <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 text-[11px] font-semibold text-white">
                      {c.unread}
                    </span>
                  )}
                </div>
                {c.needsHuman && !c.done && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                    <Hand size={10} /> Perlu manusia
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
        <div className="border-t border-slate-100 px-3 py-2 text-[11px] text-slate-400">{convos.length} perbualan</div>
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
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3">
              <button onClick={() => setSelId(null)} className="text-slate-400 sm:hidden">←</button>
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br ${CH_STYLE[sel.channel]?.avatar ?? CH_STYLE.whatsapp.avatar} text-xs font-semibold text-white`}
              >
                {(sel.name ?? sel.waId.replace(/^(fb|ig):/, "")).slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-800">{sel.name || ident(sel)}</p>
                <p className="text-xs text-slate-400">{ident(sel)}</p>
              </div>
              <div className="ml-auto flex flex-wrap items-center gap-1.5">
                <button
                  onClick={toggleBot}
                  title={sel.botPaused ? "Hidupkan bot untuk pelanggan ini" : "Matikan bot — staff ambil alih"}
                  className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    sel.botPaused ? "border-slate-300 text-slate-500 hover:bg-slate-50" : "border-violet-300 text-violet-600 hover:bg-violet-50"
                  }`}
                >
                  <Bot size={12} /> {sel.botPaused ? "Bot OFF" : "Bot ON"}
                </button>
                <button
                  onClick={toggleDone}
                  className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    sel.done ? "border-slate-300 text-slate-600 hover:bg-slate-50" : "border-emerald-300 text-emerald-600 hover:bg-emerald-50"
                  }`}
                >
                  {sel.done ? <RotateCcw size={12} /> : <CircleCheck size={12} />}
                  {sel.done ? "Buka semula" : "Selesai"}
                </button>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    windowOpen ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                  }`}
                >
                  {windowOpen ? "Boleh balas (24j)" : "Tetingkap tutup"}
                </span>
              </div>
            </div>

            {sel.needsHuman && (
              <p className="flex items-center gap-1.5 border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                <Hand size={13} /> Bot serahkan perbualan ini kepada staff. Balas di bawah — bot akan berhenti untuk pelanggan ini.
              </p>
            )}

            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-4 py-4">
              {thread.map((m) => (
                <div key={m.id} className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                      m.direction === "out"
                        ? m.bot
                          ? "rounded-br-sm bg-violet-500 text-white"
                          : "rounded-br-sm bg-emerald-500 text-white"
                        : "rounded-bl-sm bg-white text-slate-800"
                    }`}
                  >
                    {m.bot && (
                      <p className="mb-0.5 flex items-center gap-1 text-[10px] font-medium text-violet-100">
                        <Bot size={10} /> Bot
                      </p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <div
                      className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] ${
                        m.direction === "out" ? "text-white/80" : "text-slate-400"
                      }`}
                    >
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
                  ⚠️ Dah lebih 24 jam sejak pelanggan mesej. Balasan biasa akan ditolak Meta — tunggu pelanggan mesej semula.
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
