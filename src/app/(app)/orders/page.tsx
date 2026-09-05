import { db } from "@/lib/db";
import {
  PLATFORMS,
  PLATFORM_LABELS,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  type Platform,
  type OrderStatus,
} from "@/lib/constants";
import { PageHeader, EmptyState } from "@/components/ui";
import { PlatformIcon } from "@/components/platform-icon";
import { AwbOrdersTable, type AwbOrder } from "./awb-table";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Link from "next/link";
import { Upload } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ platform?: string; status?: string }>;
}) {
  const session = await getServerSession(authOptions);
  const isStaff = session?.user?.role === "staff";
  const params = await searchParams;
  const platform = PLATFORMS.includes(params.platform as Platform) ? params.platform : undefined;
  const status = ORDER_STATUSES.includes(params.status as OrderStatus) ? params.status : undefined;

  const orders = await db.order.findMany({
    where: { ...(platform && { platform }), ...(status && { status }) },
    include: { items: true },
    orderBy: { orderedAt: "desc" },
    take: 100,
  });

  const pendingCounts = await db.order.groupBy({
    by: ["platform"],
    where: { status: "pending" },
    _count: true,
  });
  const pendingByPlatform: Record<string, number> = {};
  for (const pc of pendingCounts) pendingByPlatform[pc.platform] = pc._count;

  const awbOrders: AwbOrder[] = orders.map((o) => ({
    id: o.id,
    platform: o.platform,
    platformOrderId: o.platformOrderId,
    buyerName: o.buyerName,
    items: o.items.map((it) => `${it.name} ×${it.quantity}`).join(", "),
    total: o.total,
    status: o.status,
    deliveryStatus: o.deliveryStatus,
    returnStatus: o.returnStatus,
    courier: o.courier,
    trackingNo: o.trackingNo,
    orderedAt: o.orderedAt.toISOString(),
  }));

  function filterUrl(p?: string, s?: string) {
    const q = new URLSearchParams();
    if (p) q.set("platform", p);
    if (s) q.set("status", s);
    const qs = q.toString();
    return qs ? `/orders?${qs}` : "/orders";
  }

  return (
    <div>
      <PageHeader
        title="Orders & AWB"
        subtitle={isStaff ? "Print AWB, tracking parcel & return" : "Print AWB pukal ikut platform, tracking & return"}
        action={
          isStaff ? undefined : (
            <Link
              href="/orders/import"
              className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium"
            >
              <Upload size={15} /> Import CSV
            </Link>
          )
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">Platform:</span>
        <Link
          href={filterUrl(undefined, status)}
          className={`rounded-full px-3 py-1 ${!platform ? "bg-violet-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
        >
          Semua
        </Link>
        {PLATFORMS.map((p) => (
          <Link
            key={p}
            href={filterUrl(p, status)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 ${platform === p ? "bg-violet-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
          >
            <PlatformIcon platform={p} size={14} />
            {PLATFORM_LABELS[p]}
          </Link>
        ))}
        <span className="ml-4 text-slate-500">Status:</span>
        <Link
          href={filterUrl(platform, undefined)}
          className={`rounded-full px-3 py-1 ${!status ? "bg-violet-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
        >
          Semua
        </Link>
        {ORDER_STATUSES.map((s) => (
          <Link
            key={s}
            href={filterUrl(platform, s)}
            className={`rounded-full px-3 py-1 ${status === s ? "bg-violet-600 text-white" : "bg-white border border-slate-200 text-slate-600"}`}
          >
            {ORDER_STATUS_LABELS[s]}
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <EmptyState
          title="Tiada order dijumpai"
          hint="Import CSV dari seller center atau sync WooCommerce di Settings untuk mula."
        />
      ) : (
        <AwbOrdersTable orders={awbOrders} pendingByPlatform={pendingByPlatform} isStaff={isStaff} />
      )}
    </div>
  );
}
