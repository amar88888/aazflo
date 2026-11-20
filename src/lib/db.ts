import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  pragmas?: boolean;
};

// SQLite: paksa SATU sambungan (connection_limit=1) supaya tulis/baca BERATUR —
// tiada dua penulis serentak = punca utama "database is locked" (gelong) hilang.
// Ringan je untuk dashboard trafik rendah + banyak cron.
function dbUrl(): string | undefined {
  const u = process.env.DATABASE_URL ?? "";
  if (u.startsWith("file:") && !u.includes("connection_limit")) {
    return u + (u.includes("?") ? "&" : "?") + "connection_limit=1";
  }
  return u || undefined;
}

const url = dbUrl();

export const db =
  globalForPrisma.prisma ??
  new PrismaClient(url ? { datasources: { db: { url } } } : undefined);

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// Anti-gelong SQLite: WAL (pembaca tak sekat penulis) + busy_timeout (tunggu lock,
// jangan terus throw) + synchronous NORMAL. Dijalankan sekali seumur proses.
// journal_mode=WAL kekal dalam fail DB; busy_timeout per-sambungan (kita ada 1).
// PENTING: PRAGMA pulangkan baris → mesti $queryRawUnsafe ($executeRaw throw P2010,
// dulu buat busy_timeout tak pernah ter-set). Langkau masa `next build` supaya
// proses build tak rebut lock DB dengan app yang sedang live.
if (
  !globalForPrisma.pragmas &&
  process.env.NEXT_PHASE !== "phase-production-build" &&
  (process.env.DATABASE_URL ?? "").startsWith("file:")
) {
  globalForPrisma.pragmas = true;
  void (async () => {
    try {
      await db.$queryRawUnsafe("PRAGMA busy_timeout=8000;");
      await db.$queryRawUnsafe("PRAGMA journal_mode=WAL;");
      await db.$queryRawUnsafe("PRAGMA synchronous=NORMAL;");
    } catch (e) {
      console.error("[db] gagal set PRAGMA anti-lock:", e);
    }
  })();
}
