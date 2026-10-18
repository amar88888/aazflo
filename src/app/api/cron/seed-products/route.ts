import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Cipta/kemaskini produk EVIOR sebenar supaya SKU order (FL01.. MX03) terpaut → COGS dikira.
// ?secret=XXX  (&cleanDemo=1 buang produk demo tanpa order)
const PRODUCTS = [
  { sku: "FL01", name: "FACELIM PAKEJ 1 BOTOL", cogs: 5, price: 49 },
  { sku: "FL02", name: "FACELIM PAKEJ 2 BOTOL", cogs: 10, price: 69 },
  { sku: "FL03", name: "FACELIM PAKEJ 3 BOTOL", cogs: 15, price: 99 },
  { sku: "MX01", name: "MAXLIM PAKEJ 1 BOTOL", cogs: 10, price: 49 },
  { sku: "MX02", name: "MAXLIM PAKEJ 2 BOTOL", cogs: 20, price: 69 },
  { sku: "MX03", name: "MAXLIM PAKEJ 3 BOTOL", cogs: 30, price: 99 },
  // eviorofficial.com (kedai rasmi IG) — produk single-SKU
  { sku: "ev-facelim", name: "EVIOR Facelim Ampoule 15ml", cogs: 5, price: 49 },
  { sku: "ev-maxlim", name: "EVIOR Maxlim Ampoule 15ml", cogs: 10, price: 49 },
  { sku: "ev-tonerpads", name: "EVIOR Toner Pads (50 keping)", cogs: 4, price: 25 },
  { sku: "ev-lotionputih", name: "EVIOR Lotion Putih SPF50 150ml", cogs: 4, price: 27 },
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  let upserted = 0;
  for (const p of PRODUCTS) {
    await db.product.upsert({
      where: { sku: p.sku },
      create: { sku: p.sku, wooSku: p.sku, name: p.name, cogsPerUnit: p.cogs, priceWoo: p.price },
      update: { wooSku: p.sku, name: p.name, cogsPerUnit: p.cogs },
    });
    upserted++;
  }

  // Buang produk demo (bukan EVIOR) yang takde order langsung
  let deleted: string[] = [];
  if (url.searchParams.get("cleanDemo") === "1") {
    const keep = new Set(PRODUCTS.map((p) => p.sku));
    const all = await db.product.findMany({ include: { _count: { select: { items: true } } } });
    for (const prod of all) {
      if (!keep.has(prod.sku) && prod._count.items === 0) {
        await db.product.delete({ where: { id: prod.id } });
        deleted.push(prod.sku);
      }
    }
  }
  return NextResponse.json({ ok: true, upserted, deleted });
}
