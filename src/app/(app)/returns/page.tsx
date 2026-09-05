import { db } from "@/lib/db";
import { PageHeader, Card, StatCard } from "@/components/ui";
import { formatRM, formatPercent } from "@/lib/format";
import { RecordReturnForm } from "./record-return-form";
import { ReturnsTable, type ReturnRow } from "./returns-table";
import { RotateCcw, XCircle, Coins, Percent } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReturnsPage() {
  const [orders, totalOrders] = await Promise.all([
    db.order.findMany({
      where: {
        OR: [{ returnStatus: { not: "none" } }, { deliveryStatus: "returned" }, { status: "cancelled" }],
      },
      include: { items: true },
      orderBy: { orderedAt: "desc" },
      take: 300,
    }),
    db.order.count(),
  ]);

  const rows: ReturnRow[] = orders.map((o) => {
    const isReturn = o.returnStatus !== "none" || o.deliveryStatus === "returned";
    const itemsSummary =
      o.items.length === 0
        ? "-"
        : o.items
            .slice(0, 2)
            .map((i) => `${i.quantity}× ${i.name}`)
            .join(", ") + (o.items.length > 2 ? ` +${o.items.length - 2}` : "");
    return {
      id: o.id,
      platformOrderId: o.platformOrderId,
      buyerName: o.buyerName,
      platform: o.platform,
      total: o.total,
      refundAmount: o.refundAmount,
      returnStatus: o.returnStatus,
      returnReason: o.returnReason,
      status: o.status,
      orderedAt: o.orderedAt.toISOString(),
      kind: isReturn ? "return" : "cancel",
      itemsSummary,
    };
  });

  const returnCount = rows.filter((r) => r.kind === "return").length;
  const cancelCount = rows.filter((r) => r.kind === "cancel").length;
  const totalRefund = orders.reduce((s, o) => s + o.refundAmount, 0);
  const rate = totalOrders > 0 ? ((returnCount + cancelCount) / totalOrders) * 100 : 0;

  return (
    <div>
      <PageHeader
        title="Pulangan & Batal"
        subtitle="Urus barang return, refund dan order yang dibatalkan"
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Barang Return" value={String(returnCount)} icon={RotateCcw} tone="amber" />
        <StatCard label="Order Batal" value={String(cancelCount)} icon={XCircle} tone="violet" />
        <StatCard label="Jumlah Refund" value={formatRM(totalRefund)} icon={Coins} tone="cyan" accent="red" />
        <StatCard
          label="Kadar Return + Batal"
          value={formatPercent(rate)}
          sub={`dari ${totalOrders} order`}
          icon={Percent}
          tone="emerald"
        />
      </div>

      <Card className="mt-6">
        <h2 className="mb-1 text-sm font-semibold text-slate-700">Rekod return baru</h2>
        <p className="mb-3 text-xs text-slate-500">
          Masukkan nombor order bila customer pulangkan barang. Sistem cari order tu & tandakan return.
        </p>
        <RecordReturnForm />
      </Card>

      <Card className="mt-6 !p-0">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-700">Senarai Pulangan & Batal</h2>
        </div>
        <div className="p-3">
          <ReturnsTable rows={rows} />
        </div>
      </Card>
    </div>
  );
}
