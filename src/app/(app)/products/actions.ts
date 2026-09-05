"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const productSchema = z.object({
  name: z.string().min(1),
  sku: z.string().min(1),
  cogsPerUnit: z.coerce.number().min(0),
  priceTiktok: z.coerce.number().min(0).optional(),
  priceShopee: z.coerce.number().min(0).optional(),
  priceWoo: z.coerce.number().min(0).optional(),
  tiktokSku: z.string().optional(),
  shopeeSku: z.string().optional(),
  wooSku: z.string().optional(),
});

export async function saveProductAction(formData: FormData) {
  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    sku: formData.get("sku"),
    cogsPerUnit: formData.get("cogsPerUnit"),
    priceTiktok: formData.get("priceTiktok") || undefined,
    priceShopee: formData.get("priceShopee") || undefined,
    priceWoo: formData.get("priceWoo") || undefined,
    tiktokSku: formData.get("tiktokSku") || undefined,
    shopeeSku: formData.get("shopeeSku") || undefined,
    wooSku: formData.get("wooSku") || undefined,
  });

  // Borang ada `required` di client; input tak sah cuma diabaikan
  if (!parsed.success) return;

  const data = {
    ...parsed.data,
    priceTiktok: parsed.data.priceTiktok ?? null,
    priceShopee: parsed.data.priceShopee ?? null,
    priceWoo: parsed.data.priceWoo ?? null,
    tiktokSku: parsed.data.tiktokSku || null,
    shopeeSku: parsed.data.shopeeSku || null,
    wooSku: parsed.data.wooSku || null,
  };

  await db.product.upsert({
    where: { sku: data.sku },
    update: data,
    create: data,
  });

  // Auto-link order item sedia ada yang match SKU produk ni
  const skus = [data.sku, data.tiktokSku, data.shopeeSku, data.wooSku].filter(Boolean) as string[];
  const product = await db.product.findUnique({ where: { sku: data.sku } });
  if (product) {
    await db.orderItem.updateMany({
      where: { sku: { in: skus }, productId: null },
      data: { productId: product.id },
    });
  }

  revalidatePath("/products");
  revalidatePath("/pnl");
}

export async function deleteProductAction(id: string) {
  await db.orderItem.updateMany({ where: { productId: id }, data: { productId: null } });
  await db.product.delete({ where: { id } });
  revalidatePath("/products");
}

// Inline edit dari jadual — kemaskini harga & COGS sahaja.
// Field kosong = null (tak dijual di platform tu), BUKAN 0.
export async function updateProductInlineAction(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const price = (name: string): number | null => {
    const raw = String(formData.get(name) ?? "").trim();
    if (raw === "") return null;
    const v = parseFloat(raw);
    return isNaN(v) || v < 0 ? null : v;
  };
  const cogsRaw = parseFloat(String(formData.get("cogsPerUnit") ?? "0"));
  const cogs = isNaN(cogsRaw) || cogsRaw < 0 ? 0 : cogsRaw;

  await db.product.update({
    where: { id },
    data: {
      priceTiktok: price("priceTiktok"),
      priceShopee: price("priceShopee"),
      priceWoo: price("priceWoo"),
      cogsPerUnit: cogs,
    },
  });
  revalidatePath("/products");
  revalidatePath("/pnl");
}
