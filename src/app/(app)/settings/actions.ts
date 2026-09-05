"use server";

import { db } from "@/lib/db";
import { fetchWooOrders, getWooConfigFromEnv, mapWooStatus } from "@/lib/integrations/woocommerce";
import { buildAuthUrl as buildTikTokAuthUrl } from "@/lib/integrations/tiktok";
import { buildAuthUrl as buildShopeeAuthUrl } from "@/lib/integrations/shopee";
import { loadCredentials, saveCredentials } from "@/lib/credentials";
import { sendTelegram, detectChatId, type TelegramCreds } from "@/lib/telegram";
import { buildDailyReport } from "@/lib/report";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { subDays } from "date-fns";

// ── Telegram report harian ──

export async function saveTelegramAction(formData: FormData) {
  const botToken = String(formData.get("botToken") ?? "").trim();
  const chatId = String(formData.get("chatId") ?? "").trim();
  const existing = await loadCredentials<TelegramCreds>("telegram");
  await saveCredentials("telegram", {
    botToken: botToken || existing?.botToken || "",
    chatId: chatId || existing?.chatId || "",
  });
  revalidatePath("/settings");
  return { ok: true, message: "Konfigurasi Telegram disimpan." };
}

export async function detectChatIdAction() {
  const r = await detectChatId();
  if (r.ok && r.chatId) {
    const existing = await loadCredentials<TelegramCreds>("telegram");
    await saveCredentials("telegram", { botToken: existing?.botToken ?? "", chatId: r.chatId });
    revalidatePath("/settings");
  }
  return r;
}

export async function sendTestReportAction() {
  const report = await buildDailyReport();
  return sendTelegram(report);
}

// ── Higgsfield (Content AI) — simpan API key encrypted dalam DB ──
export async function saveHiggsfieldAction(formData: FormData) {
  const credentials = String(formData.get("credentials") ?? "").trim();
  if (credentials && credentials.includes(":")) {
    await saveCredentials("higgsfield", { credentials });
  }
  revalidatePath("/settings");
  revalidatePath("/content");
}

// ── Fee platform (%) — dipakai dalam P&L bila order tiada fee sebenar ──
export async function saveFeesAction(formData: FormData) {
  const { setSetting } = await import("@/lib/settings");
  for (const key of ["fee_tiktok", "fee_shopee", "fee_woo"] as const) {
    const raw = String(formData.get(key) ?? "").trim();
    const v = parseFloat(raw);
    if (raw !== "" && !isNaN(v) && v >= 0 && v <= 100) {
      await setSetting(key, String(v));
    }
  }
  revalidatePath("/settings");
  revalidatePath("/pnl");
}

// Mula OAuth: jana auth URL platform & redirect user ke sana untuk benarkan akses.
export async function connectTikTokAction() {
  const url = buildTikTokAuthUrl(randomUUID());
  redirect(url);
}

export async function connectShopeeAction() {
  redirect(buildShopeeAuthUrl());
}

export async function syncWooCommerceAction() {
  const config = getWooConfigFromEnv();
  if (!config) {
    return {
      ok: false,
      message: "WooCommerce belum di-setup. Isi WOOCOMMERCE_URL, CONSUMER_KEY & CONSUMER_SECRET dalam fail .env dan restart server.",
    };
  }

  try {
    // Sync 30 hari terakhir, max 3 page (300 order)
    const after = subDays(new Date(), 30);
    let imported = 0;
    let updated = 0;

    for (let page = 1; page <= 3; page++) {
      const orders = await fetchWooOrders(config, { after, page });
      if (orders.length === 0) break;

      for (const wo of orders) {
        const platformOrderId = String(wo.id);
        const buyerName = `${wo.billing.first_name} ${wo.billing.last_name}`.trim() || null;
        const status = mapWooStatus(wo.status);

        const items = [];
        for (const li of wo.line_items) {
          let productId: string | null = null;
          if (li.sku) {
            const product = await db.product.findFirst({
              where: { OR: [{ sku: li.sku }, { wooSku: li.sku }] },
            });
            productId = product?.id ?? null;
          }
          items.push({
            sku: li.sku || null,
            name: li.name,
            quantity: li.quantity,
            unitPrice: Number(li.price) || 0,
            productId,
          });
        }

        const existing = await db.order.findUnique({
          where: { platform_platformOrderId: { platform: "woocommerce", platformOrderId } },
        });

        if (existing) {
          await db.order.update({
            where: { id: existing.id },
            data: {
              status: existing.status === "pending" ? status : existing.status,
              total: Number(wo.total) || 0,
            },
          });
          updated++;
        } else {
          await db.order.create({
            data: {
              platform: "woocommerce",
              platformOrderId,
              status,
              buyerName,
              total: Number(wo.total) || 0,
              shippingFee: Number(wo.shipping_total) || 0,
              orderedAt: new Date(wo.date_created),
              source: "api",
              items: { create: items },
            },
          });
          imported++;
        }
      }
      if (orders.length < 100) break;
    }

    revalidatePath("/orders");
    revalidatePath("/dashboard");
    return { ok: true, message: `Sync WooCommerce selesai: ${imported} order baru, ${updated} dikemaskini.` };
  } catch (err) {
    return { ok: false, message: `Sync gagal: ${err instanceof Error ? err.message : String(err)}` };
  }
}
