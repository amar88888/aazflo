import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Maintenance harian SQLite — jaga DB stabil & tak membengkak.
//  - wal_checkpoint(TRUNCATE): gabung WAL ke DB utama + kecilkan fail -wal,
//    lepaskan sebarang lock lama (punca "gelong").
//  - integrity_check: pastikan fail DB tak corrupt (kalau corrupt, kita tahu awal).
//  - optimize: kemas statistik index supaya query laju & tepat.
//
//   GET /api/cron/maintenance?secret=XXX
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const steps: Record<string, unknown> = {};
  let healthy = true;

  try {
    steps.walCheckpoint = await db.$queryRawUnsafe("PRAGMA wal_checkpoint(TRUNCATE);");
  } catch (e) {
    steps.walCheckpointError = String(e);
    healthy = false;
  }

  try {
    const r = (await db.$queryRawUnsafe("PRAGMA integrity_check;")) as { integrity_check: string }[];
    steps.integrity = r;
    const ok = Array.isArray(r) && r.length === 1 && r[0]?.integrity_check === "ok";
    if (!ok) healthy = false;
  } catch (e) {
    steps.integrityError = String(e);
    healthy = false;
  }

  try {
    await db.$executeRawUnsafe("PRAGMA optimize;");
    steps.optimize = "ok";
  } catch (e) {
    steps.optimizeError = String(e);
  }

  // PRAGMA pulangkan BigInt — JSON.stringify tak boleh, tukar ke Number dulu.
  const safe = JSON.parse(JSON.stringify(steps, (_k, v) => (typeof v === "bigint" ? Number(v) : v)));

  return NextResponse.json({
    ok: true,
    healthy,
    at: new Date().toISOString(),
    steps: safe,
    message: healthy
      ? "Maintenance selesai: DB sihat, lock dilepas, fail WAL dikemas."
      : "Maintenance jalan TAPI ada isu — semak steps (integrity/checkpoint).",
  });
}
