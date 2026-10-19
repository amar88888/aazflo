import { db } from "@/lib/db";
import { PageHeader } from "@/components/ui";
import { startOfDayMY, endOfDayMY } from "@/lib/myt";
import KachingLive from "./kaching-live";

export const dynamic = "force-dynamic";

const ACTIVE = ["pending", "printed", "shipped", "completed"];
function currencyFor(store: string): "RM" | "SGD" {
  return /sg/i.test(store) ? "SGD" : "RM";
}

export default async function KachingPage() {
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

  const initial = {
    ok: true,
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
  };

  return (
    <div>
      <PageHeader title="Ka-Ching Live 💰" subtitle="Buka page ni kat PC/TV kedai — bunyi cha-ching tiap order masuk (real-time)" />
      <KachingLive initial={initial} />
    </div>
  );
}
