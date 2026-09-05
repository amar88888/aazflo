// Seed produk untuk PRODUCTION (idempotent — selamat jalan setiap deploy).
// Guna @prisma/client sahaja (tiada tsx), dipanggil dari `postbuild`.
// TIDAK cipta order/expense sample — data sebenar datang dari sync WooCommerce/API.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Produk sebenar EVIOR OFFICIAL HQ. wooSku/priceWoo diisi untuk item yang dijual di maxlim.shop.
const PRODUCTS = [
  { name: "Maxlim (1 botol)", sku: "MAX-1", cogsPerUnit: 10.5, priceTiktok: 29.0, priceShopee: 29.0, priceWoo: 59.0, wooSku: "MX01" },
  { name: "Maxlim (2 botol)", sku: "MAX-2", cogsPerUnit: 21.0, priceTiktok: 49.0, priceShopee: 49.0, priceWoo: 89.0, wooSku: "MX02" },
  { name: "Maxlim (3 botol)", sku: "MAX-3", cogsPerUnit: 31.5, priceTiktok: 69.0, priceShopee: 69.0, priceWoo: 119.0, wooSku: "MX03" },
  { name: "Facelim (1 botol)", sku: "FACE-1", cogsPerUnit: 5.0, priceTiktok: 25.7, priceShopee: 25.7 },
  { name: "Facelim (2 botol)", sku: "FACE-2", cogsPerUnit: 10.0, priceTiktok: 45.0, priceShopee: 45.0 },
  { name: "Facelim (3 botol)", sku: "FACE-3", cogsPerUnit: 15.0, priceTiktok: 65.0, priceShopee: 65.0 },
  { name: "Combo Maxlim & Facelim (1 set)", sku: "CMB-1", cogsPerUnit: 15.5, priceTiktok: 48.0, priceShopee: 50.0 },
  { name: "Combo Maxlim & Facelim (2 set)", sku: "CMB-2", cogsPerUnit: 31.0, priceTiktok: 85.0, priceShopee: 85.0 },
  { name: "Toner Pads Glow Skin (1)", sku: "TPGS-1", cogsPerUnit: 3.0, priceTiktok: 10.9, priceShopee: 10.9 },
  { name: "Toner Pads Glow Skin (3)", sku: "TPGS-3", cogsPerUnit: 9.0, priceTiktok: 29.9, priceShopee: 29.9 },
  { name: "Snow Whitening Lotion SPF50 (1 botol)", sku: "SNOW-1", cogsPerUnit: 4.0, priceTiktok: 10.21, priceShopee: 19.9 },
  { name: "Snow Whitening Lotion SPF50 (3 botol)", sku: "SNOW-3", cogsPerUnit: 12.0, priceTiktok: 33.0, priceShopee: null },
  { name: "EDP Perfume Veloura 330ml", sku: "VELO-1", cogsPerUnit: 7.0, priceTiktok: 22.21, priceShopee: null },
];

async function main() {
  for (const p of PRODUCTS) {
    await prisma.product.upsert({
      where: { sku: p.sku },
      // Kemaskini mapping woo + harga bila re-run; kekalkan COGS kalau user dah ubah manual? — set semula default.
      update: { wooSku: p.wooSku ?? null, priceWoo: p.priceWoo ?? null },
      create: p,
    });
  }
  const n = await prisma.product.count();
  console.log(`[seed-prod] Produk siap: ${n} SKU.`);
}

main()
  .catch((e) => {
    console.error("[seed-prod] gagal:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
