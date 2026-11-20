// Jalankan `prisma migrate deploy` dengan CUBA SEMULA bila SQLite "database is locked".
// App live (cron) kadang pegang lock sekejap masa deploy → dulu terus FAILED (rc=1).
import { execSync } from "node:child_process";

const TRIES = 12;
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
    if (i < TRIES) sleep(WAIT_MS);
    else {
      console.error(out);
      process.exit(1);
    }
  }
}
