import { db } from "@/lib/db";
import { type WooOrder, mapWooStatus, getNinjaTracking } from "@/lib/integrations/woocommerce";

// Susunan status — sync hanya gerak status KE DEPAN (tak undur).
const RANK: Record<string, number> = {
  pending: 0,
  printed: 1,
  shipped: 2,
  completed: 3,
  cancelled: 9,
};

function decideStatus(existing: string, mapped: string): string {
  if (mapped === "cancelled") return "cancelled"; // Woo batal → batal
  if (existing === "cancelled") return "cancelled"; // jangan auto un-cancel
  const re = RANK[existing] ?? 0;
  const rm = RANK[mapped] ?? 0;
  return rm > re ? mapped : existing;
}

const PRINTED_PLUS = new Set(["printed", "shipped", "completed"]);

// Upsert satu order WooCommerce ke DB. Kembalikan sama ada baru / dikemaskini.
// Mengambil kira tracking Ninja Van + status nv-* supaya AWB yang dah print
// terus tertanda "printed" dalam Aazflo.
export async function upsertWooOrder(wo: WooOrder): Promise<"imported" | "updated"> {
  const platformOrderId = String(wo.id);
  const buyerName = `${wo.billing.first_name} ${wo.billing.last_name}`.trim() || null;
  const mapped = mapWooStatus(wo.status);
  const tracking = getNinjaTracking(wo);
  const courier = tracking ? "Ninja Van" : null;

  const items = [];
  for (const li of wo.line_items) {
    let productId: string | null = null;
    if (li.sku) {
      const product = await db.product.findFirst({ where: { OR: [{ sku: li.sku }, { wooSku: li.sku }] } });
      productId = product?.id ?? null;
    }
    items.push({
      sku: li.sku || null,
      name: li.name,
      quantity: li.quantity,
      unitPrice: Number(li.price) || 0,
      productId,
    });
  }

  const existing = await db.order.findUnique({
    where: { platform_platformOrderId: { platform: "woocommerce", platformOrderId } },
  });

  if (existing) {
    const status = decideStatus(existing.status, mapped);
    const printedNow = PRINTED_PLUS.has(status);
    await db.order.update({
      where: { id: existing.id },
      data: {
        status,
        total: Number(wo.total) || 0,
        trackingNo: tracking ?? existing.trackingNo,
        courier: courier ?? existing.courier,
        awbPrintedAt: printedNow && !existing.awbPrintedAt ? new Date() : existing.awbPrintedAt,
      },
    });
    return "updated";
  }

  const status = mapped;
  const printedNow = PRINTED_PLUS.has(status);
  await db.order.create({
    data: {
      platform: "woocommerce",
      platformOrderId,
      status,
      buyerName,
      total: Number(wo.total) || 0,
      shippingFee: Number(wo.shipping_total) || 0,
      orderedAt: new Date(wo.date_created),
      source: "api",
      trackingNo: tracking,
      courier,
      awbPrintedAt: printedNow ? new Date() : null,
      items: { create: items },
    },
  });
  return "imported";
}
