import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Produk sebenar EVIOR OFFICIAL HQ (harga & costing termasuk packaging, dari user 2026-07-17).
// Modal seunit: Maxlim 10.50, Facelim 5.00, Snow 4.00, Toner Pads 3.00, Perfume 7.00.
const PRODUCTS = [
  { name: "Maxlim (1 botol)", sku: "MAX-1", cogsPerUnit: 10.5, priceTiktok: 29.0, priceShopee: 29.0 },
  { name: "Maxlim (2 botol)", sku: "MAX-2", cogsPerUnit: 21.0, priceTiktok: 49.0, priceShopee: 49.0 },
  { name: "Maxlim (3 botol)", sku: "MAX-3", cogsPerUnit: 31.5, priceTiktok: 69.0, priceShopee: 69.0 },
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

function daysAgo(n: number, hour = 12): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d;
}

async function main() {
  const products = [];
  for (const p of PRODUCTS) {
    products.push(
      await prisma.product.upsert({ where: { sku: p.sku }, update: {}, create: p })
    );
  }

  const existing = await prisma.order.count();
  if (existing > 0) {
    console.log(`DB dah ada ${existing} order — skip seed order.`);
    return;
  }

  const platforms = ["tiktok", "shopee", "woocommerce"] as const;
  let counter = 1000;

  for (let day = 0; day < 30; day++) {
    for (const platform of platforms) {
      // TikTok paling banyak order, website paling sikit — data sample realistik
      const orderCount =
        platform === "tiktok" ? 3 + (day % 4) : platform === "shopee" ? 2 + (day % 3) : day % 2;
      // Courier ikut platform (realistik MY)
      const courierByPlatform: Record<string, string> = {
        tiktok: "J&T Express",
        shopee: "SPX Express",
        woocommerce: "Pos Laju",
      };

      for (let i = 0; i < orderCount; i++) {
        // Guna harga platform sebenar; skip produk yang tak dijual di platform tu
        const platformProducts = products.filter((p) =>
          platform === "shopee" ? p.priceShopee != null : p.priceTiktok != null
        );
        const product = platformProducts[(day + i) % platformProducts.length];
        const qty = 1;
        const unitPrice =
          (platform === "shopee" ? product.priceShopee : product.priceTiktok) ?? 0;
        const total = unitPrice * qty;
        const printed = day >= 2;

        // Delivery status ikut umur order
        let deliveryStatus = "pending";
        if (day >= 6) deliveryStatus = "delivered";
        else if (day >= 4) deliveryStatus = "out_for_delivery";
        else if (day >= 2) deliveryStatus = "in_transit";

        // ~1 dari 15 order jadi return
        const isReturn = (counter + i) % 15 === 0 && day >= 5;
        const trackingNo = printed
          ? `${courierByPlatform[platform].slice(0, 2).toUpperCase()}${100000000 + counter * 7 + i}`
          : null;

        await prisma.order.create({
          data: {
            platform,
            platformOrderId: `${platform.toUpperCase()}-${counter++}`,
            status: day < 2 ? "pending" : "completed",
            buyerName: `Customer ${counter}`,
            total,
            platformFee: platform === "woocommerce" ? 0 : total * 0.08,
            orderedAt: daysAgo(day, 9 + i),
            source: "seed",
            courier: printed ? courierByPlatform[platform] : null,
            trackingNo,
            deliveryStatus: isReturn ? "returned" : deliveryStatus,
            shippedAt: printed ? daysAgo(day - 1 > 0 ? day - 1 : 0, 14) : null,
            deliveredAt: deliveryStatus === "delivered" && !isReturn ? daysAgo(day - 3 > 0 ? day - 3 : 0, 16) : null,
            returnStatus: isReturn ? "refunded" : "none",
            returnReason: isReturn ? "Produk rosak semasa penghantaran" : null,
            refundAmount: isReturn ? total : 0,
            items: {
              create: {
                sku: product.sku,
                name: product.name,
                quantity: qty,
                unitPrice,
                productId: product.id,
              },
            },
          },
        });
      }
    }
  }

  // Sample expenses
  await prisma.expense.createMany({
    data: [
      { type: "ads", label: "TikTok Ads", amount: 850, platform: "tiktok", date: daysAgo(5) },
      { type: "ads", label: "Shopee Ads", amount: 420, platform: "shopee", date: daysAgo(10) },
      { type: "fixed", label: "Gaji staff", amount: 1800, date: daysAgo(15), recurring: true },
      { type: "fixed", label: "Internet + utiliti studio", amount: 250, date: daysAgo(15), recurring: true },
      { type: "other", label: "Packaging & kotak", amount: 320, date: daysAgo(8) },
    ],
  });

  // Sample stok barang packaging (ada yang bawah reorder level)
  await prisma.supply.createMany({
    data: [
      { name: "Botol 30ml", unit: "pcs", currentStock: 320, reorderLevel: 100 },
      { name: "Kotak S", unit: "pcs", currentStock: 45, reorderLevel: 80 },
      { name: "Bubble Wrap", unit: "roll", currentStock: 2, reorderLevel: 5 },
      { name: "Selotape", unit: "roll", currentStock: 8, reorderLevel: 10 },
      { name: "Polymailer", unit: "pcs", currentStock: 500, reorderLevel: 150 },
    ],
  });

  // Sample duit office (petty cash)
  await prisma.cashTxn.createMany({
    data: [
      { date: daysAgo(20), type: "topup", category: "other", amount: 1000, description: "Top-up petty cash office" },
      { date: daysAgo(12), type: "expense", category: "supplies", amount: 185.5, description: "Beli bubble wrap + kotak" },
      { date: daysAgo(7), type: "expense", category: "lalamove", amount: 42, description: "Lalamove hantar parcel bulk" },
      { date: daysAgo(3), type: "claim", category: "supplies", amount: 60, description: "Claim staff beli selotape" },
      { date: daysAgo(1), type: "expense", category: "lalamove", amount: 28, description: "Lalamove pickup" },
    ],
  });

  // Kehadiran hari ni
  await prisma.attendance.create({
    data: { date: new Date(), partTimers: 3, names: "Aina, Faiz, Zul", wageTotal: 240 },
  });

  console.log("Seed selesai: 3 produk, ~30 hari order, 5 expenses, 5 barang, 5 cash txn, kehadiran.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
