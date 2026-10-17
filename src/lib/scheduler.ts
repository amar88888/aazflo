// Jadual dalaman Aazflo — jalankan cron TERUS dalam server (tak bergantung routine cloud luar,
// yang disekat proxy). Setiap job panggil route /api/cron/* sendiri melalui localhost.
//
// Waktu ikut Malaysia (UTC+8):
//   • sync-ads-expense (hari ni + semalam) — setiap jam :10
//   • sync-woo + sync-stripe (backup webhook)  — setiap 3 jam :35
//   • auto-profit (pause rugi / scale menang)   — 00:06, 04:06, 08:06, 12:06, 16:06, 20:06
//   • laporan pagi Telegram                     — 08:00 (sync dulu, lepas tu hantar)

import { sendTelegram } from "@/lib/telegram";

type Job = { name: string; due: (h: number, m: number) => boolean; paths: string[] };

const JOBS: Job[] = [
  { name: "iklan", due: (_h, m) => m === 10, paths: ["sync-ads-expense?days=2"] },
  { name: "sync", due: (h, m) => h % 3 === 0 && m === 35, paths: ["sync-woo", "sync-stripe?days=2"] },
  { name: "auto-profit", due: (h, m) => h % 4 === 0 && m === 6, paths: ["auto-profit?dryrun=0"] },
  // Hidupkan ad menang Facelim MY tepat 00:01 MYT (sekali, date-guard dalam endpoint)
  { name: "facelim-my-on", due: (h, m) => h === 0 && m === 1, paths: ["facelim-my-on"] },
  // Pengawal order (tersangkut / berganda / salah kedai) — tiap jam :20, 8 pagi–11 malam
  { name: "pengawal-order", due: (h, m) => h >= 8 && h <= 23 && m === 20, paths: ["order-guard?send=1"] },
  {
    name: "laporan-pagi",
    due: (h, m) => h === 8 && m === 0,
    paths: ["sync-woo", "sync-ads-expense?days=2", "daily-report?pagi=1"],
  },
];

// Rekod larian terakhir setiap job (untuk /api/cron/jadual-status).
type RunLog = Record<string, { at: string; ok: boolean; errors: string[] }>;
export function jadualLog(): RunLog {
  const g = globalThis as { __aazfloJadualLog?: RunLog };
  return (g.__aazfloJadualLog ??= {});
}

function mytNow() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return { h: d.getUTCHours(), m: d.getUTCMinutes(), key: d.toISOString().slice(0, 16) };
}

async function hit(path: string, secret: string): Promise<string | null> {
  const port = process.env.PORT || "3000";
  const sep = path.includes("?") ? "&" : "?";
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/cron/${path}${sep}secret=${secret}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(170_000),
    });
    const body = await res.text();
    if (!res.ok || body.includes('"ok":false')) return `${path} → ${res.status} ${body.slice(0, 150)}`;
    return null;
  } catch (e) {
    return `${path} → ${e instanceof Error ? e.message : String(e)}`;
  }
}

async function runJob(job: Job, secret: string) {
  const errors: string[] = [];
  for (const p of job.paths) {
    const err = await hit(p, secret);
    // Stripe key mungkin belum di-set di server — log je, jangan spam Telegram.
    if (err && p.startsWith("sync-stripe")) console.log(`[jadual] (abai) ${err}`);
    else if (err) errors.push(err);
  }
  console.log(`[jadual] ${job.name}: ${errors.length ? "GAGAL " + errors.join(" | ") : "ok"}`);
  jadualLog()[job.name] = { at: new Date().toISOString(), ok: errors.length === 0, errors };
  if (errors.length) {
    await sendTelegram(`⚠️ <b>Jadual Aazflo gagal</b> (${job.name})\n${errors.join("\n").replace(/</g, "&lt;")}`).catch(
      () => {}
    );
  }
}

export function startScheduler() {
  const g = globalThis as { __aazfloJadual?: boolean };
  if (g.__aazfloJadual) return;
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.log("[jadual] CRON_SECRET tiada — jadual dalaman tak dimulakan");
    return;
  }
  g.__aazfloJadual = true;

  const done = new Set<string>();
  const running = new Set<string>();
  setInterval(() => {
    const { h, m, key } = mytNow();
    for (const job of JOBS) {
      const k = `${job.name}@${key}`;
      if (!job.due(h, m) || done.has(k) || running.has(job.name)) continue;
      done.add(k);
      running.add(job.name);
      runJob(job, secret).finally(() => running.delete(job.name));
    }
    if (done.size > 500) done.clear();
  }, 20_000);

  // Lepas deploy/restart: segarkan iklan sekali supaya dashboard terus tepat.
  setTimeout(() => runJob(JOBS[0], secret), 90_000);
  console.log("[jadual] jadual dalaman Aazflo bermula");
}
