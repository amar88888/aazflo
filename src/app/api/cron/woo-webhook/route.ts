import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { upsertWooOrder } from "@/lib/woo-sync";
import { sendTelegram } from "@/lib/telegram";
import type { WooOrder } from "@/lib/integrations/woocommerce";
import { sendPurchaseCapi, type CapiOrder } from "@/lib/meta-capi";

export const dynamic = "force-dynamic";

// Webhook WooCommerce (order.created / order.updated) — real-time.
//   POST /api/cron/woo-webhook?secret=XXX&store=facelim
// 1) Upsert order ke Aazflo serta-merta (dashboard tak tunggu sync 3 jam)
// 2) 💰 KA-CHING ke Telegram bila order SAH (COD/dah bayar) kali pertama
const STORE_LABEL: Record<string, string> = {
  facelim: "🇲🇾 Facelim MY",
  facelimsg: "🇸🇬 Facelim SG",
  maxlim: "🇲🇾 Maxlim",
  maxlimsg: "🇸🇬 Maxlim SG",
};

// Elak ka-ching berganda bila order.created & order.updated sampai serentak
const g = globalThis as unknown as { __kaching?: Set<string> };
const alerted = (g.__kaching ??= new Set<string>());

export async function POST(req: Request) {
  const url = new URL(req.url);
  if (!process.env.CRON_SECRET || url.searchParams.get("secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  const store = url.searchParams.get("store") || "maxlim";

  // Woo hantar "ping" (webhook_id=..) masa webhook dicipta — balas 200
  const raw = await req.text();
  let wo: WooOrder & { currency?: string; payment_method?: string; payment_method_title?: string };
  try {
    wo = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true, ping: true });
  }
  if (!wo?.id || !Array.isArray(wo.line_items)) return NextResponse.json({ ok: true, ignored: true });

  const key = `${store}:${wo.id}`;
  const prev = await db.order.findUnique({
    where: { platform_store_platformOrderId: { platform: "woocommerce", store, platformOrderId: String(wo.id) } },
    select: { status: true },
  });

  await upsertWooOrder(wo, store);

  // Order sah = COD / dah bayar (processing, completed, nv-*)
  const s = String(wo.status || "");
  const valid = s === "processing" || s === "completed" || s.startsWith("nv-");
  const firstTime = !prev || prev.status === "unpaid";
  let kaching = false;
  let capi: { sent: boolean; detail: string } | null = null;
  if (valid && firstTime && !alerted.has(key)) {
    alerted.add(key);
    // Meta CAPI: Purchase dari server (eventID sama dgn pixel browser → dedup)
    capi = await sendPurchaseCapi(wo as CapiOrder, store).catch((e) => ({ sent: false, detail: String(e) }));
    // Amaran CAPI gagal (maks sekali sejam) — kedai tanpa pixel CAPI tak dikira gagal
    const gc = globalThis as unknown as { __capiAlert?: number };
    if (!capi.sent && !capi.detail.includes("tiada pixel") && Date.now() - (gc.__capiAlert ?? 0) > 3600_000) {
      gc.__capiAlert = Date.now();
      await sendTelegram(`⚠️ <b>Meta CAPI gagal</b>\n${capi.detail.replace(/</g, "&lt;").slice(0, 300)}`).catch(() => {});
    }
    const cur = (wo.currency || "").toUpperCase() === "SGD" ? "S$" : "RM";
    const pay = wo.payment_method === "cod" ? "COD" : wo.payment_method_title || "Dibayar";
    const items = wo.line_items.map((li) => `${li.name} ×${li.quantity}`).join(", ");
    const name = `${wo.billing?.first_name ?? ""} ${wo.billing?.last_name ?? ""}`.trim() || "-";
    const msg = [
      "💰 <b>KA-CHING! Order baru</b>",
      `${STORE_LABEL[store] ?? store} · #${wo.id}`,
      `👤 ${name}`,
      `💵 ${cur}${Number(wo.total).toFixed(2)} · ${pay}`,
      `📦 ${items}`,
    ].join("\n");
    kaching = (await sendTelegram(msg)).ok;
  }

  return NextResponse.json({ ok: true, store, order: wo.id, kaching, capi });
}
