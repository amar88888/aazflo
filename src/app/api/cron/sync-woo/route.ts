import { NextResponse } from "next/server";
import { fetchWooOrders, getWooStores } from "@/lib/integrations/woocommerce";
import { upsertWooOrder } from "@/lib/woo-sync";

export const dynamic = "force-dynamic";

// Sync PENUH order WooCommerce ke DB (window luas — tangkap order lama).
// Loop SEMUA kedai (maxlim + facelim + ...). Dilindungi CRON_SECRET.
//   GET /api/cron/sync-woo?secret=XXX[&days=400][&store=facelim]
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  let stores = await getWooStores();
  const only = url.searchParams.get("store");
  if (only) stores = stores.filter((s) => s.key === only);
  if (stores.length === 0) {
    return NextResponse.json({ ok: false, message: "Tiada kedai WooCommerce di-setup." }, { status: 400 });
  }

  // Default tangkap 600 hari ke belakang.
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "600", 10) || 600, 1), 1200);
  const after = new Date(Date.now() - days * 86400000);

  let imported = 0;
  let updated = 0;
  const perStore: Record<string, { imported: number; updated: number; error?: string }> = {};
  for (const store of stores) {
    perStore[store.key] = { imported: 0, updated: 0 };
    try {
      for (let page = 1; page <= 12; page++) {
        const orders = await fetchWooOrders(store, { after, page });
        if (orders.length === 0) break;
        for (const wo of orders) {
          const res = await upsertWooOrder(wo, store.key);
          if (res === "imported") {
            imported++;
            perStore[store.key].imported++;
          } else {
            updated++;
            perStore[store.key].updated++;
          }
        }
        if (orders.length < 100) break;
      }
    } catch (err) {
      perStore[store.key].error = err instanceof Error ? err.message : String(err);
    }
  }

  return NextResponse.json({
    ok: true,
    imported,
    updated,
    perStore,
    message: `Sync selesai: ${imported} baru, ${updated} update (${stores.length} kedai).`,
  });
}
