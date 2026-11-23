// Jalankan `prisma migrate deploy` dengan CUBA SEMULA bila SQLite "database is locked".
// App live (PM2) pegang lock DB masa Velocity build → dulu deploy terus FAILED (rc=1).
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, existsSync, rmSync } from "node:fs";

// Velocity TAK padam folder yang dah dibuang dari git (deploy 79a495f nampak
// 11 migration, sepatutnya 9). Migration yang dah digabung/dibuang mesti
// disenarai di sini supaya dipadam dari server sebelum migrate.
const listFile = (f) =>
  existsSync(f)
    ? readFileSync(f, "utf8")
        .split("\n")
        .map((x) => x.trim())
        .filter((x) => x && !x.startsWith("#"))
    : [];
for (const name of listFile("prisma/migrations-obsolete.txt")) {
  const dir = `prisma/migrations/${name}`;
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
    console.log(`[migrate-safe] padam migration usang: ${name}`);
  }
}

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

// Sama dengan SAFE dalam src/lib/runtime-migrate.ts — kemaskini kedua-dua sekali.
const SAFE = /^(CREATE (UNIQUE )?INDEX|CREATE TABLE|ALTER TABLE "[^"]+" ADD COLUMN)\b/i;
function additiveOnly(name) {
  const f = `prisma/migrations/${name}/migration.sql`;
  if (!existsSync(f)) return true;
  return readFileSync(f, "utf8")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean)
    .every((s) => SAFE.test(s));
}

// Migration tambah-sahaja boleh ditangguh ke runtime → tak perlu tunggu 2 minit.
const TRIES = fresh.length && !fresh.every(additiveOnly) ? 12 : 3;
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
    } else if (fresh.every(additiveOnly)) {
      // Lock eksklusif Prisma takkan dapat selagi app live hidup. Migration ni cuma
      // tambah (CREATE/ADD COLUMN) → app baru apply sendiri masa start
      // (src/lib/runtime-migrate.ts, dipanggil dari instrumentation.ts).
      console.warn(
        `[migrate-safe] DB locked — migration tambah-sahaja ditangguh ke runtime-migrate masa app start: ${fresh.join(", ")}`,
      );
      process.exit(0);
    } else {
      console.error(`[migrate-safe] Migration BARU belum applied: ${fresh.join(", ")}`);
      console.error(out);
      process.exit(1);
    }
  }
}
