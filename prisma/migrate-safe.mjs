// Jalankan `prisma migrate deploy` dengan CUBA SEMULA bila SQLite "database is locked".
// App live (PM2) pegang lock DB masa Velocity build → dulu deploy terus FAILED (rc=1).
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync } from "node:fs";

// Migration yang SAH dah dijalankan di prod. Kemaskini fail ni SELEPAS migration baru
// berjaya di-deploy. Kalau DB locked & tiada migration baru → selamat langkau migrate.
const applied = existsSync("prisma/migrations-applied.txt")
  ? readFileSync("prisma/migrations-applied.txt", "utf8")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
  : [];
const current = readdirSync("prisma/migrations", { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
const fresh = current.filter((m) => !applied.includes(m));

const TRIES = fresh.length ? 12 : 3;
const WAIT_MS = 10_000;
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

for (let i = 1; i <= TRIES; i++) {
  try {
    execSync("npx prisma migrate deploy", { stdio: "pipe", encoding: "utf8" });
    console.log(`[migrate-safe] OK (cubaan ${i})`);
    process.exit(0);
  } catch (e) {
    const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
    const locked = /database is locked|SQLITE_BUSY/i.test(out);
    console.log(`[migrate-safe] cubaan ${i}/${TRIES} gagal${locked ? " (locked)" : ""}`);
    if (!locked) {
      console.error(out);
      process.exit(1);
    }
    if (i < TRIES) {
      sleep(WAIT_MS);
    } else if (fresh.length === 0) {
      console.warn(
        `[migrate-safe] DB locked oleh app live, tapi TIADA migration baru (${current.length} semua dah applied) → langkau migrate.`,
      );
      process.exit(0);
    } else {
      console.error(`[migrate-safe] Migration BARU belum applied: ${fresh.join(", ")}`);
      console.error(out);
      process.exit(1);
    }
  }
}
