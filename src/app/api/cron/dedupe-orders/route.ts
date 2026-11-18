import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getWooStores } from "@/lib/integrations/woocommerce";

export const dynamic = "force-dynamic";

// Bersihkan order BERGANDA — order FIZIKAL yang sama tertulis >1 kali kerana kedai
// sama (cth facelim.com) pernah terdaftar bawah DUA store-key berbeza (satu via
// EXTRA_WOO_STORES, satu via Settings UI). Dulu getWooStores dedup ikut key sahaja,
// jadi full-sync fetch kedai itu 2 kali → double-write → dashboard & P&L naik palsu.
//
// Punca dah ditutup (getWooStores kini dedup ikut URL). Cron ini kemas data LAMA.
//
// SELAMAT:
//  - Hanya satukan baris yang IDENTIK fizikal: platformOrderId + buyerName + orderedAt
//    sama. Kolision SAH antara kedai (cth MY #68685 vs SG #68685) ada buyerName/orderedAt
//    berbeza → TAK disentuh.
//  - Simpan baris di bawah store-key KANONIK (yang masih wujud dlm getWooStores); kalau
//    tak pasti, simpan yang paling awal (createdAt). Buang yang lain. OrderItem auto-hapus.
//
//   GET /api/cron/dedupe-orders?secret=XXX           → dry-run (senarai sahaja)
//   GET /api/cron/dedupe-orders?secret=XXX&apply=1    → buang betul-betul
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  const apply = url.searchParams.get("apply") === "1";

  const canonical = new Set((await getWooStores()).map((s) => s.key));

  const rows = await db.order.findMany({
    where: { platform: "woocommerce" },
    select: {
      id: true,
      store: true,
      platformOrderId: true,
      buyerName: true,
      orderedAt: true,
      total: true,
      createdAt: true,
    },
  });

  // Kumpul ikut identiti fizikal order (sama seperti dedupeOrders di dashboard).
  const groups = new Map<string, typeof rows>();
  for (const o of rows) {
    const k = `${o.platformOrderId}|${o.buyerName ?? ""}|${o.orderedAt.getTime()}`;
    const g = groups.get(k) ?? [];
    g.push(o);
    groups.set(k, g);
  }

  const toDelete: { id: string; order: string; buyer: string | null; store: string; total: number }[] = [];
  const keptSummary: { order: string; store: string }[] = [];

  for (const g of groups.values()) {
    if (g.length < 2) continue; // tiada pendua
    if (new Set(g.map((o) => o.store)).size < 2) continue; // selamat: mesti merentas store berbeza

    // Pilih baris untuk SIMPAN: utamakan store kanonik; jika seri/tiada, yang paling awal.
    const ranked = [...g].sort((a, b) => {
      const ca = canonical.has(a.store) ? 0 : 1;
      const cb = canonical.has(b.store) ? 0 : 1;
      if (ca !== cb) return ca - cb;
      return a.createdAt.getTime() - b.createdAt.getTime();
    });
    const [keep, ...drop] = ranked;
    keptSummary.push({ order: keep.platformOrderId, store: keep.store });
    for (const d of drop) {
      toDelete.push({ id: d.id, order: d.platformOrderId, buyer: d.buyerName, store: d.store, total: d.total });
    }
  }

  let deleted = 0;
  if (apply && toDelete.length > 0) {
    const r = await db.order.deleteMany({ where: { id: { in: toDelete.map((d) => d.id) } } });
    deleted = r.count; // OrderItem auto-hapus (onDelete: Cascade)
  }

  return NextResponse.json({
    ok: true,
    mode: apply ? "apply" : "dry-run",
    scanned: rows.length,
    duplicateGroups: keptSummary.length,
    rowsToRemove: toDelete.length,
    deleted,
    sample: toDelete.slice(0, 20),
    message: apply
      ? `Selesai: ${deleted} baris order berganda dibuang (${keptSummary.length} order dikemas).`
      : `Dry-run: ${toDelete.length} baris berganda dikesan dalam ${keptSummary.length} order (belum buang). Tambah &apply=1 untuk buang.`,
  });
}
