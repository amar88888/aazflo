import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { startOfDayMY as startOfDay, endOfDayMY as endOfDay } from "@/lib/myt";

// Diagnostik sementara: apa Aazflo kira utk "hari ni" per kedai (orderedAt + status).
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const now = new Date();
  const from = startOfDay(now);
  const to = endOfDay(now);
  const ACTIVE = ["pending", "printed", "shipped", "completed"];

  const store = url.searchParams.get("store") || "facelimsg";
  // Semua order kedai ni yang dicipta/diubah baru-baru (ambil 25 terkini)
  const recent = await db.order.findMany({
    where: { store },
    orderBy: { orderedAt: "desc" },
    take: 25,
    select: { platformOrderId: true, status: true, orderedAt: true },
  });
  const todayActive = recent.filter(
    (o) => o.orderedAt >= from && o.orderedAt <= to && ACTIVE.includes(o.status)
  );
  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    tz: process.env.TZ ?? "(tiada)",
    rangeFrom: from.toISOString(),
    rangeTo: to.toISOString(),
    store,
    countTodayActive: todayActive.length,
    recent: recent.map((o) => ({
      id: o.platformOrderId,
      status: o.status,
      orderedAt: o.orderedAt.toISOString(),
      dalamHariNi: o.orderedAt >= from && o.orderedAt <= to,
      aktif: ACTIVE.includes(o.status),
    })),
  });
}
