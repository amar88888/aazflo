import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { loadCredentials, saveCredentials } from "@/lib/credentials";

export const dynamic = "force-dynamic";

type Store = { key: string; name?: string; url: string; user: string; pass: string };

// One-time setup (dilindungi CRON_SECRET):
//  - Sambung kedai WooCommerce tambahan ke woo_stores (encrypted) — dedup ikut key
//  - Kemaskini wooSku + COGS produk supaya padan masa sync (margin betul)
// POST /api/admin/connect-stores?secret=XXX   body: { stores: [{key,name,url,user,pass}], cogs?: true }
export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { stores?: Store[]; cogs?: boolean };
  const incoming = Array.isArray(body.stores) ? body.stores : [];
  const valid = incoming
    .filter((s) => s && s.key && s.url && s.user && s.pass)
    .map((s) => ({ key: s.key, name: s.name || s.key, url: String(s.url).replace(/\/$/, ""), user: s.user, pass: s.pass }));

  // 1) Simpan kedai (merge dgn sedia ada, dedup ikut key)
  let storeKeys: string[] = [];
  if (valid.length) {
    const existing = await loadCredentials<{ stores: Store[] }>("woo_stores");
    const map = new Map<string, Store>();
    for (const s of existing?.stores ?? []) map.set(s.key, s);
    for (const s of valid) map.set(s.key, s);
    const stores = [...map.values()];
    await saveCredentials("woo_stores", { stores });
    storeKeys = stores.map((s) => s.key);
  }

  // 2) Kemaskini COGS + wooSku (RM10/botol). Idempotent.
  let cogsUpdated = 0;
  if (body.cogs) {
    // Kos sebenar: Facelim RM5/botol, Maxlim RM10/botol
    const COGS: { sku: string; wooSku: string; cogs: number }[] = [
      { sku: "FACE-1", wooSku: "FL01", cogs: 5 },
      { sku: "FACE-2", wooSku: "FL02", cogs: 10 },
      { sku: "FACE-3", wooSku: "FL03", cogs: 15 },
      { sku: "MAX-1", wooSku: "MX01", cogs: 10 },
      { sku: "MAX-2", wooSku: "MX02", cogs: 20 },
      { sku: "MAX-3", wooSku: "MX03", cogs: 30 },
    ];
    for (const c of COGS) {
      try {
        await db.product.update({ where: { sku: c.sku }, data: { wooSku: c.wooSku, cogsPerUnit: c.cogs } });
        cogsUpdated++;
      } catch {
        /* produk tak wujud — abaikan */
      }
    }
  }

  return NextResponse.json({ ok: true, storesConnected: storeKeys, cogsUpdated });
}
