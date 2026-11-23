"use server";

import { fetchWooOrders, getWooStores, type WooStore, type WooStoresCreds } from "@/lib/integrations/woocommerce";
import { upsertWooOrder } from "@/lib/woo-sync";
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

// ── WhatsApp Cloud API (Inbox) ──
export async function saveWhatsAppAction(formData: FormData) {
  const { loadCredentials, saveCredentials } = await import("@/lib/credentials");
  const { randomBytes } = await import("crypto");
  type WA = import("@/lib/whatsapp").WhatsAppCreds;
  const existing = await loadCredentials<WA>("whatsapp");

  const accessToken = String(formData.get("accessToken") ?? "").trim();
  const phoneNumberId = String(formData.get("phoneNumberId") ?? "").trim().replace(/[^0-9]/g, "");
  const wabaId = String(formData.get("wabaId") ?? "").trim().replace(/[^0-9]/g, "");
  const appSecret = String(formData.get("appSecret") ?? "").trim();

  const wa = await import("@/lib/whatsapp");
  const { getMetaCreds } = await import("@/lib/integrations/meta-ads");
  const meta = await getMetaCreds();

  const creds: WA = {
    accessToken: accessToken || existing?.accessToken || "",
    phoneNumberId: phoneNumberId || existing?.phoneNumberId || "",
    wabaId: wabaId || existing?.wabaId || undefined,
    appSecret: appSecret || existing?.appSecret || meta?.appSecret || undefined,
    // Jana verify token sekali — kekal selepas tu
    verifyToken: existing?.verifyToken || "aaz_" + randomBytes(12).toString("hex"),
    displayNumber: existing?.displayNumber,
  };
  if (!creds.accessToken) return { ok: false, message: "Paste Access Token dulu." };

  const notes: string[] = [];
  const appId = meta?.appId;
  const appToken = appId && meta?.appSecret ? `${appId}|${meta.appSecret}` : undefined;

  // 1) Auto-cari WABA + Phone Number ID kalau tak diisi
  const found = await wa.discoverWhatsApp(creds.accessToken, appToken);
  if (!found.ok && !creds.phoneNumberId) {
    return { ok: false, message: found.error ?? "Tak jumpa nombor WhatsApp." };
  }
  if (found.ok) {
    const pick = found.phones.find((p) => p.id === creds.phoneNumberId) ?? found.phones[0];
    creds.phoneNumberId = pick.id;
    creds.wabaId = pick.wabaId;
    creds.displayNumber = pick.display_phone_number;
    notes.push(`Nombor: ${pick.verified_name ?? ""} ${pick.display_phone_number ?? ""}`.trim());
    if (found.phones.length > 1) notes.push(`(${found.phones.length} nombor dijumpai — guna yang pertama; isi Phone Number ID untuk tukar)`);
  }

  // 2) Simpan DULU (Meta akan GET webhook untuk sahkan verify token)
  await saveCredentials("whatsapp", creds);

  // 3) Langgan app ke WABA (supaya mesej masuk dihantar ke webhook)
  if (creds.wabaId) {
    const s = await wa.subscribeAppToWaba(creds.wabaId, creds.accessToken);
    notes.push(s.ok ? "✓ App dilanggan ke akaun WhatsApp" : `✗ Langgan WABA: ${s.error}`);
  }

  // 4) Daftar callback webhook (kalau token dari app Aazflo yang sama)
  const base = (process.env.NEXTAUTH_URL || "https://aazflo.com").replace(/\/$/, "");
  if (appId && meta?.appSecret && (!found.tokenAppId || found.tokenAppId === appId)) {
    const r = await wa.registerAppWebhook(appId, meta.appSecret, `${base}/api/whatsapp/webhook`, creds.verifyToken!);
    notes.push(r.ok ? "✓ Webhook didaftar automatik" : `✗ Webhook: ${r.error} — set manual guna URL & token di bawah`);
  } else {
    notes.push("Webhook: set manual di Meta App (URL & Verify Token di bawah)");
  }

  revalidatePath("/settings");
  revalidatePath("/inbox");
  return { ok: true, message: notes.join(" · ") };
}

export async function testWhatsAppAction() {
  const { getWhatsAppConfig, saveCredentials } = {
    getWhatsAppConfig: (await import("@/lib/whatsapp")).getWhatsAppConfig,
    saveCredentials: (await import("@/lib/credentials")).saveCredentials,
  };
  const cfg = await getWhatsAppConfig();
  if (!cfg) return { ok: false, message: "Belum setup — isi token & Phone Number ID dulu." };
  try {
    const res = await fetch(
      `https://graph.facebook.com/v22.0/${cfg.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating&access_token=${encodeURIComponent(cfg.accessToken)}`,
    );
    const j = (await res.json()) as {
      display_phone_number?: string;
      verified_name?: string;
      quality_rating?: string;
      error?: { message?: string };
    };
    if (j.error) return { ok: false, message: j.error.message ?? "Token/Phone ID tak sah." };
    await saveCredentials("whatsapp", { ...cfg, displayNumber: j.display_phone_number });
    return {
      ok: true,
      message: `✓ Sambung OK — ${j.verified_name ?? ""} (${j.display_phone_number ?? ""}) · kualiti ${j.quality_rating ?? "-"}`,
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Ralat rangkaian." };
  }
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

// ── Meta Ads — simpan token + ad account; auto-tukar ke long-lived (kekal) ──
export async function saveMetaAction(formData: FormData) {
  const accessToken = String(formData.get("accessToken") ?? "").trim();
  const adAccountId = String(formData.get("adAccountId") ?? "").trim();
  const appId = String(formData.get("appId") ?? "").trim();
  const appSecret = String(formData.get("appSecret") ?? "").trim();

  const { loadCredentials } = await import("@/lib/credentials");
  const { saveMetaToken } = await import("@/lib/integrations/meta-ads");
  const existing = await loadCredentials<{ accessToken: string; adAccountId: string }>("meta");

  const res = await saveMetaToken({
    accessToken: accessToken || existing?.accessToken || "",
    adAccountId: adAccountId || existing?.adAccountId || "",
    appId,
    appSecret,
  });
  revalidatePath("/settings");
  revalidatePath("/ads");
  return {
    ok: true,
    message: res.longLived
      ? "Disimpan — token ditukar ke 60-hari & akan auto-renew (kekal)."
      : "Disimpan. (Tambah App Secret untuk token kekal auto-renew.)",
  };
}

export async function testMetaAction() {
  const { testMetaConnection } = await import("@/lib/integrations/meta-ads");
  return testMetaConnection();
}

// ── Kedai WooCommerce tambahan (multi-store) — cth facelim ──
export async function saveWooStoreAction(formData: FormData) {
  const key = String(formData.get("key") ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
  const name = String(formData.get("name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim().replace(/\/$/, "");
  const user = String(formData.get("user") ?? "").trim();
  const pass = String(formData.get("pass") ?? "").replace(/\s+/g, ""); // buang space (WP app password)
  if (!key || !url || !user || !pass) return { ok: false, message: "Lengkapkan semua medan." };
  if (key === "maxlim") return { ok: false, message: "Kunci 'maxlim' dikhaskan untuk kedai utama." };

  const existing = await loadCredentials<WooStoresCreds>("woo_stores");
  const stores = (existing?.stores ?? []).filter((s) => s.key !== key);
  stores.push({ key, name: name || key, url, user, pass });
  await saveCredentials("woo_stores", { stores });
  revalidatePath("/settings");
  revalidatePath("/orders");
  return { ok: true, message: `Kedai "${name || key}" disimpan. Tekan Sync untuk tarik order.` };
}

export async function testWooStoreAction(formData: FormData) {
  const url = String(formData.get("url") ?? "").trim().replace(/\/$/, "");
  const user = String(formData.get("user") ?? "").trim();
  const pass = String(formData.get("pass") ?? "").replace(/\s+/g, "");
  if (!url || !user || !pass) return { ok: false, message: "Lengkapkan URL, user & password." };
  const testStore: WooStore = { key: "__test", name: "test", url, user, pass };
  try {
    const orders = await fetchWooOrders(testStore, { page: 1 });
    return { ok: true, message: `Berjaya sambung — dapat ${orders.length} order.` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function removeWooStoreAction(key: string) {
  const existing = await loadCredentials<WooStoresCreds>("woo_stores");
  const stores = (existing?.stores ?? []).filter((s) => s.key !== key);
  await saveCredentials("woo_stores", { stores });
  revalidatePath("/settings");
  revalidatePath("/orders");
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
  const stores = await getWooStores();
  if (stores.length === 0) {
    return { ok: false, message: "Tiada kedai WooCommerce di-setup." };
  }

  try {
    // Sync 30 hari terakhir, max 3 page setiap kedai (300 order/kedai)
    const after = subDays(new Date(), 30);
    let imported = 0;
    let updated = 0;
    const notes: string[] = [];

    for (const store of stores) {
      let si = 0;
      let su = 0;
      try {
        for (let page = 1; page <= 3; page++) {
          const orders = await fetchWooOrders(store, { after, page });
          if (orders.length === 0) break;
          for (const wo of orders) {
            const res = await upsertWooOrder(wo, store.key);
            if (res === "imported") si++;
            else su++;
          }
          if (orders.length < 100) break;
        }
        notes.push(`${store.name}: ${si} baru, ${su} update`);
      } catch (err) {
        notes.push(`${store.name}: GAGAL (${err instanceof Error ? err.message : String(err)})`);
      }
      imported += si;
      updated += su;
    }

    revalidatePath("/orders");
    revalidatePath("/dashboard");
    return { ok: true, message: `Sync selesai — ${notes.join(" · ")}.` };
  } catch (err) {
    return { ok: false, message: `Sync gagal: ${err instanceof Error ? err.message : String(err)}` };
  }
}
