import { db } from "@/lib/db";
import {
  type WooOrder,
  mapWooStatus,
  getNinjaTracking,
  getNinjaEvents,
  mapNinjaDelivery,
  type TrackingEvent,
} from "@/lib/integrations/woocommerce";

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
// terus tertanda "printed" dalam Aazflo. `storeKey` = kedai (maxlim/facelim/...).
export async function upsertWooOrder(wo: WooOrder, storeKey = "maxlim"): Promise<"imported" | "updated"> {
  const platformOrderId = String(wo.id);
  const buyerName = `${wo.billing.first_name} ${wo.billing.last_name}`.trim() || null;
  const mapped = mapWooStatus(wo.status);
  const tracking = getNinjaTracking(wo);
  const courier = tracking ? "Ninja Van" : null;

  // Perjalanan parcel + delivery status dari NinjaVan
  const events: TrackingEvent[] = getNinjaEvents(wo);
  const nvDelivery = mapNinjaDelivery(wo.status);
  const eventsJson = events.length > 0 ? JSON.stringify(events) : null;
  const findEvent = (kw: string) => events.find((e) => e.stage.toLowerCase().includes(kw))?.at ?? null;
  const shippedAtStr = findEvent("picked up") ?? findEvent("in transit") ?? findEvent("transit");
  const deliveredAtStr = nvDelivery?.deliveryStatus === "delivered" ? (findEvent("delivered") ?? findEvent("completed")) : null;
  const lastAtStr = events.length > 0 ? events[events.length - 1].at : null;

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
    where: { platform_store_platformOrderId: { platform: "woocommerce", store: storeKey, platformOrderId } },
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
        // Delivery / journey dari NinjaVan (kalau ada)
        ...(nvDelivery && { deliveryStatus: nvDelivery.deliveryStatus }),
        ...(nvDelivery?.returnStatus && existing.returnStatus === "none" && { returnStatus: nvDelivery.returnStatus }),
        ...(eventsJson && { trackingEvents: eventsJson }),
        ...(lastAtStr && { lastTrackingAt: new Date(lastAtStr) }),
        ...(shippedAtStr && !existing.shippedAt && { shippedAt: new Date(shippedAtStr) }),
        ...(deliveredAtStr && !existing.deliveredAt && { deliveredAt: new Date(deliveredAtStr) }),
      },
    });
    return "updated";
  }

  const status = mapped;
  const printedNow = PRINTED_PLUS.has(status);
  await db.order.create({
    data: {
      platform: "woocommerce",
      store: storeKey,
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
      deliveryStatus: nvDelivery?.deliveryStatus ?? "pending",
      returnStatus: nvDelivery?.returnStatus ?? "none",
      trackingEvents: eventsJson,
      lastTrackingAt: lastAtStr ? new Date(lastAtStr) : null,
      shippedAt: shippedAtStr ? new Date(shippedAtStr) : null,
      deliveredAt: deliveredAtStr ? new Date(deliveredAtStr) : null,
      items: { create: items },
    },
  });
  return "imported";
}
