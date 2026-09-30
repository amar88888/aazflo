import { NextResponse } from "next/server";
import { fetchWooOrders, getWooConfigFromEnv } from "@/lib/integrations/woocommerce";
import { upsertWooOrder } from "@/lib/woo-sync";

export const dynamic = "force-dynamic";

// Sync PENUH order WooCommerce ke DB (window luas — tangkap order lama).
// Dilindungi CRON_SECRET. Boleh dipanggil manual atau dijadualkan.
//   GET /api/cron/sync-woo?secret=XXX[&days=400]
export async function GET(req: Request) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const config = getWooConfigFromEnv();
  if (!config) {
    return NextResponse.json({ ok: false, message: "WooCommerce env belum diisi." }, { status: 400 });
  }

  // Default tangkap 600 hari ke belakang (cukup untuk order Mac-April 2026).
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "600", 10) || 600, 1), 1200);
  const after = new Date(Date.now() - days * 86400000);

  let imported = 0;
  let updated = 0;
  try {
    for (let page = 1; page <= 12; page++) {
      const orders = await fetchWooOrders(config, { after, page });
      if (orders.length === 0) break;

      for (const wo of orders) {
        const res = await upsertWooOrder(wo);
        if (res === "imported") imported++;
        else updated++;
      }
      if (orders.length < 100) break;
    }
  } catch (err) {
    return NextResponse.json(
      { ok: false, imported, updated, message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, imported, updated, message: `Sync selesai: ${imported} baru, ${updated} update.` });
}
