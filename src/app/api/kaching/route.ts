import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { startOfDayMY, endOfDayMY } from "@/lib/myt";

export const dynamic = "force-dynamic";

// Order "hidup" (bukan batal/unpaid) untuk ka-ching.
const ACTIVE = ["pending", "printed", "shipped", "completed"];

function currencyFor(store: string): "RM" | "SGD" {
  return /sg/i.test(store) ? "SGD" : "RM";
}

// Suapan order terkini untuk page Ka-Ching Live (di-poll dari browser).
// GET /api/kaching  → 20 order terkini hari ni + jumlah hari ni.
export async function GET() {
  const now = new Date();
  const ds = startOfDayMY(now);
  const de = endOfDayMY(now);

  const [orders, agg] = await Promise.all([
    db.order.findMany({
      where: { orderedAt: { gte: ds, lte: de }, status: { in: ACTIVE } },
      orderBy: { orderedAt: "desc" },
      take: 20,
      select: { id: true, store: true, total: true, buyerName: true, orderedAt: true },
    }),
    db.order.aggregate({
      where: { orderedAt: { gte: ds, lte: de }, status: { in: ACTIVE } },
      _count: true,
      _sum: { total: true },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    todayOrders: agg._count,
    todayRevenue: agg._sum.total ?? 0,
    orders: orders.map((o) => ({
      id: o.id,
      store: o.store,
      currency: currencyFor(o.store),
      total: o.total,
      buyer: o.buyerName ?? null,
      at: o.orderedAt.toISOString(),
    })),
  });
}
