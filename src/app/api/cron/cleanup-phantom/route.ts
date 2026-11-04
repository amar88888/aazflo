import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWooStores } from "@/lib/integrations/woocommerce";

export const dynamic = "force-dynamic";

// Bersihkan order "maxlim" HANTU — order kedai lain (cth Facelim) yang tersalah
// masuk sebagai store="maxlim" kerana webhook lama default ke "maxlim" bila param
// ?store= hilang. Ini punca double-count P&L Maxlim.
//
// SELAMAT: setiap calon disahkan via API maxlim.shop dahulu. Kalau order itu
// memang WUJUD di maxlim.shop (bukan hantu), ia TIDAK disentuh. Order maxlim
// sebenar (nombor 68xxx) tak pernah jadi calon kerana platformOrderId-nya tak
// bertindih dengan kedai lain.
//
//   GET /api/cron/cleanup-phantom?secret=XXX           → dry-run (senarai sahaja)
//   GET /api/cron/cleanup-phantom?secret=XXX&apply=1    → buang betul-betul
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  const apply = url.searchParams.get("apply") === "1";

  const stores = await getWooStores();
  const maxlim = stores.find((s) => s.key === "maxlim");
  if (!maxlim) {
    return NextResponse.json({ ok: false, message: "Kedai maxlim tak di-setup." }, { status: 400 });
  }

  // Order tersimpan sebagai store="maxlim"
  const maxlimOrders = await db.order.findMany({
    where: { platform: "woocommerce", store: "maxlim" },
    select: { id: true, platformOrderId: true, buyerName: true, total: true },
  });
  // platformOrderId yang juga wujud di kedai LAIN (petanda kuat salah-label)
  const otherIds = new Set(
    (
      await db.order.findMany({
        where: { platform: "woocommerce", store: { not: "maxlim" } },
        select: { platformOrderId: true },
      })
    ).map((o) => o.platformOrderId),
  );
  const candidates = maxlimOrders.filter((o) => otherIds.has(o.platformOrderId));

  // Sahkan setiap calon betul-betul tiada di maxlim.shop (404) sebelum buang.
  const auth = Buffer.from(`${maxlim.user}:${maxlim.pass}`).toString("base64");
  const phantom: typeof candidates = [];
  const kept: typeof candidates = [];
  for (const c of candidates) {
    let existsOnMaxlim = true; // default: ragu → JANGAN buang
    try {
      const res = await fetch(`${maxlim.url}/wp-json/wc/v3/orders/${c.platformOrderId}`, {
        headers: { Authorization: `Basic ${auth}`, "User-Agent": "Aazflo/1.0 (+https://aazflo.com)" },
        cache: "no-store",
      });
      if (res.status === 404) existsOnMaxlim = false;
    } catch {
      existsOnMaxlim = true;
    }
    (existsOnMaxlim ? kept : phantom).push(c);
  }

  let deleted = 0;
  if (apply && phantom.length > 0) {
    const r = await db.order.deleteMany({ where: { id: { in: phantom.map((p) => p.id) } } });
    deleted = r.count; // OrderItem auto-hapus (onDelete: Cascade)
  }

  return NextResponse.json({
    ok: true,
    mode: apply ? "apply" : "dry-run",
    candidates: candidates.length,
    phantomFound: phantom.length,
    keptReal: kept.length,
    deleted,
    phantom: phantom.map((p) => ({ order: p.platformOrderId, buyer: p.buyerName, total: p.total })),
    message: apply
      ? `Selesai: ${deleted} order Maxlim hantu dibuang.`
      : `Dry-run: ${phantom.length} hantu dikesan (belum buang). Tambah &apply=1 untuk buang.`,
  });
}
