"use server";

import { db } from "@/lib/db";
import { parseOrderCsv } from "@/lib/csv";
import { revalidatePath } from "next/cache";

export async function importCsvAction(formData: FormData) {
  const platform = formData.get("platform") as "tiktok" | "shopee";
  const file = formData.get("file") as File | null;

  if (!file || !["tiktok", "shopee"].includes(platform)) {
    return { ok: false, message: "Sila pilih platform dan fail CSV.", imported: 0, updated: 0 };
  }

  const text = await file.text();
  const result = parseOrderCsv(text, platform);

  if (result.errors.length > 0 && result.orders.length === 0) {
    return { ok: false, message: result.errors.join(" "), imported: 0, updated: 0 };
  }

  let imported = 0;
  let updated = 0;

  for (const o of result.orders) {
    // Auto-link item ke Product ikut SKU untuk kiraan COGS
    const itemsWithProduct = [];
    for (const it of o.items) {
      let productId: string | null = null;
      if (it.sku) {
        const product = await db.product.findFirst({
          where: {
            OR: [
              { sku: it.sku },
              ...(platform === "tiktok" ? [{ tiktokSku: it.sku }] : [{ shopeeSku: it.sku }]),
            ],
          },
        });
        productId = product?.id ?? null;
      }
      itemsWithProduct.push({ ...it, productId });
    }

    const existing = await db.order.findUnique({
      where: { platform_platformOrderId: { platform, platformOrderId: o.platformOrderId } },
    });

    if (existing) {
      await db.order.update({
        where: { id: existing.id },
        data: {
          // Jangan turunkan status yang dah maju (printed/shipped) balik ke pending
          status: existing.status === "pending" ? o.status : existing.status,
          total: o.total,
        },
      });
      updated++;
    } else {
      await db.order.create({
        data: {
          platform,
          platformOrderId: o.platformOrderId,
          status: o.status,
          buyerName: o.buyerName,
          total: o.total,
          orderedAt: o.orderedAt,
          source: "csv",
          items: { create: itemsWithProduct },
        },
      });
      imported++;
    }
  }

  revalidatePath("/orders");
  revalidatePath("/dashboard");

  const skipNote = result.skippedRows > 0 ? ` (${result.skippedRows} row diskip)` : "";
  return {
    ok: true,
    message: `Import selesai: ${imported} order baru, ${updated} dikemaskini${skipNote}.`,
    imported,
    updated,
  };
}

export async function markPrintedAction(orderId: string) {
  await db.order.update({
    where: { id: orderId },
    data: { status: "printed", awbPrintedAt: new Date() },
  });
  revalidatePath("/orders");
  revalidatePath("/dashboard");
}

export async function markAllPrintedAction(platform: string) {
  const pending = await db.order.findMany({
    where: { platform, status: "pending" },
    select: { id: true },
  });
  if (pending.length === 0) return;

  const batch = await db.awbBatch.create({
    data: { platform, orderCount: pending.length },
  });
  await db.order.updateMany({
    where: { id: { in: pending.map((p) => p.id) } },
    data: { status: "printed", awbPrintedAt: new Date(), awbBatchId: batch.id },
  });
  revalidatePath("/orders");
  revalidatePath("/dashboard");
}
