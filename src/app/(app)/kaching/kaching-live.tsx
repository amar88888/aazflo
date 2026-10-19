"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Order = {
  id: string;
  store: string;
  currency: "RM" | "SGD";
  total: number;
  buyer: string | null;
  at: string;
};
type Feed = { ok: boolean; todayOrders: number; todayRevenue: number; orders: Order[] };

const STORE_LABELS: Record<string, string> = {
  facelim: "Facelim MY",
  facelimsg: "Facelim SG",
  maxlim: "Maxlim MY",
  maxlimsg: "Maxlim SG",
  eviorofficial: "EVIOR Official",
};
function label(s: string) {
  return STORE_LABELS[s] ?? s;
}
function sym(c: "RM" | "SGD") {
  return c === "SGD" ? "S$" : "RM";
}
function fmtAmt(c: "RM" | "SGD", n: number) {
  return sym(c) + n.toLocaleString(c === "SGD" ? "en-SG" : "en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("ms-MY", { timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

// 🔔 Cha-ching cash register guna Web Audio — "cha" (thunk) + dua "ting" terang.
function playKaching(ctx: AudioContext, vol: number) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = vol;
  master.connect(ctx.destination);

  // "cha" — thunk rendah mekanikal
  [180, 320].forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.value = f;
    const amp = i === 0 ? 0.55 : 0.35;
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(amp, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
    o.connect(g).connect(master);
    o.start(now);
    o.stop(now + 0.14);
  });

  // dua "ting" bell terang (0.00s & 0.24s selepas thunk) — tanda cash register
  const ring = (t0: number, freqs: number[], amps: number[], decay: number) => {
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(amps[i], t0 + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + decay);
      o.connect(g).connect(master);
      o.start(t0);
      o.stop(t0 + decay + 0.05);
    });
  };
  ring(now + 0.02, [1318.5, 1760, 2637, 3520], [0.5, 0.38, 0.3, 0.18], 0.45);
  ring(now + 0.26, [1567, 2093, 3135, 4186], [0.46, 0.34, 0.26, 0.15], 0.6);
}

export default function KachingLive({ initial }: { initial: Feed }) {
  const [feed, setFeed] = useState<Feed>(initial);
  const [soundOn, setSoundOn] = useState(false);
  const [vol, setVol] = useState(0.9);
  const [flash, setFlash] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const seen = useRef<Set<string>>(new Set(initial.orders.map((o) => o.id)));
  const volRef = useRef(vol);
  volRef.current = vol;

  const enableSound = useCallback(() => {
    if (!ctxRef.current) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctxRef.current = new AC();
    }
    ctxRef.current!.resume();
    setSoundOn(true);
    // main sekali masa enable supaya user dengar + unlock audio
    playKaching(ctxRef.current!, volRef.current);
  }, []);

  const poll = useCallback(async () => {
    try {
      const r = await fetch("/api/kaching", { cache: "no-store" });
      if (!r.ok) return;
      const data: Feed = await r.json();
      // order baru = id yang tak pernah nampak
      let fresh = 0;
      for (const o of data.orders) {
        if (!seen.current.has(o.id)) {
          seen.current.add(o.id);
          fresh++;
        }
      }
      setFeed(data);
      if (fresh > 0 && soundOn && ctxRef.current) {
        for (let i = 0; i < Math.min(fresh, 3); i++) {
          setTimeout(() => playKaching(ctxRef.current!, volRef.current), i * 750);
        }
        setFlash(true);
        setTimeout(() => setFlash(false), 900);
      }
    } catch {
      /* senyap — cuba lagi pusingan depan */
    }
  }, [soundOn]);

  useEffect(() => {
    const t = setInterval(poll, 7000);
    return () => clearInterval(t);
  }, [poll]);

  const myCount = feed.orders.length;

  return (
    <div className={flash ? "rounded-2xl ring-4 ring-emerald-400/70 transition" : "rounded-2xl transition"}>
      {/* Jumlah hari ni */}
      <div className="mb-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Order Hari Ni</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-slate-800">{feed.todayOrders}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs text-slate-500">Jualan Hari Ni</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-emerald-600">
            RM{feed.todayRevenue.toLocaleString("en-MY", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
          </p>
        </div>
      </div>

      {/* Kawalan bunyi */}
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
        {!soundOn ? (
          <button
            onClick={enableSound}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
          >
            🔔 Hidupkan Bunyi Ka-Ching
          </button>
        ) : (
          <>
            <span className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">🔊 Bunyi ON</span>
            <button
              onClick={() => ctxRef.current && playKaching(ctxRef.current, volRef.current)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Test bunyi
            </button>
            <label className="ml-auto flex items-center gap-2 text-xs text-slate-500">
              Kuat
              <input type="range" min={0.2} max={1} step={0.1} value={vol} onChange={(e) => setVol(parseFloat(e.target.value))} />
            </label>
          </>
        )}
      </div>
      {!soundOn && (
        <p className="mb-4 text-center text-xs text-slate-400">
          Browser perlu kau tekan butang dulu baru boleh main bunyi (peraturan autoplay). Tekan sekali je.
        </p>
      )}

      {/* Suapan order */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold text-slate-500">
          Order Terkini ({myCount}) · auto-refresh 7s
        </div>
        {feed.orders.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">Belum ada order hari ni — tunggu cha-ching 💰</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {feed.orders.map((o) => (
              <li key={o.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{label(o.store)}</p>
                  <p className="text-xs text-slate-400">{o.buyer ?? "—"}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums text-emerald-600">{fmtAmt(o.currency, o.total)}</p>
                  <p className="text-xs text-slate-400">{fmtTime(o.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
