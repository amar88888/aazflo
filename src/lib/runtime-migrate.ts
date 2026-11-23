import crypto from "crypto";
import fs from "fs";
import path from "path";
import { db } from "@/lib/db";

// ── Apply migration baru masa app START (bukan masa build) ──
// Kenapa: `prisma migrate deploy` untuk SQLite minta lock EKSKLUSIF → selagi app
// live (PM2) hidup, ia SENTIASA "database is locked" → deploy Velocity gagal
// (02757c1, 24 Nov 2026). Di sini kita guna sambungan app sendiri (busy_timeout,
// WAL) — tak perlu lock eksklusif.
//
// Selamat: hanya apply migration yang 100% "tambah" (CREATE TABLE / CREATE INDEX /
// ALTER TABLE … ADD COLUMN). Migration lain (redefine, DROP, PRAGMA) → log ralat,
// perlu `prisma migrate deploy` manual dengan app dihentikan.
// Rekod dalam _prisma_migrations sama macam Prisma (checksum sha256 kandungan LF)
// supaya `prisma migrate deploy` lepas ni anggap ia dah applied.

const SAFE = /^(CREATE (UNIQUE )?INDEX|CREATE TABLE|ALTER TABLE "[^"]+" ADD COLUMN)\b/i;

function statements(sql: string): string[] {
  return sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*(?:\n|$)/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function runPendingMigrations(): Promise<void> {
  if (!(process.env.DATABASE_URL ?? "").startsWith("file:")) return;
  const dir = path.join(process.cwd(), "prisma", "migrations");
  if (!fs.existsSync(dir)) return;

  let done: Set<string>;
  try {
    const rows = await db.$queryRawUnsafe<{ migration_name: string }[]>(
      "SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL",
    );
    done = new Set(rows.map((r) => r.migration_name));
  } catch (e) {
    console.error("[runtime-migrate] tak boleh baca _prisma_migrations:", e);
    return;
  }

  const pending = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !done.has(d.name))
    .map((d) => d.name)
    .sort();
  if (!pending.length) return;

  for (const name of pending) {
    const file = path.join(dir, name, "migration.sql");
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
    const stmts = statements(content);
    const unsafe = stmts.find((s) => !SAFE.test(s));
    if (unsafe) {
      console.error(
        `[runtime-migrate] ${name} ada statement bukan-tambah (${unsafe.slice(0, 60)}…) — perlu migrate deploy manual (stop app dulu). Berhenti.`,
      );
      return; // jangan langkau — migration seterusnya mungkin bergantung
    }
    const checksum = crypto.createHash("sha256").update(content).digest("hex");
    const started = Date.now();
    try {
      await db.$transaction(
        async (tx) => {
          for (const s of stmts) await tx.$executeRawUnsafe(s);
          await tx.$executeRawUnsafe(
            "INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count) VALUES (?, ?, ?, ?, NULL, NULL, ?, 1)",
            crypto.randomUUID(),
            checksum,
            Date.now(),
            name,
            started,
          );
        },
        { timeout: 30_000, maxWait: 30_000 },
      );
      console.log(`[runtime-migrate] ✓ ${name} (${stmts.length} statement)`);
    } catch (e) {
      console.error(`[runtime-migrate] ✗ ${name} gagal:`, e);
      return;
    }
  }
}
