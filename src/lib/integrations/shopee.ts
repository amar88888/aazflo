import crypto from "crypto";
import { loadCredentials, saveCredentials, type ShopeeCreds } from "@/lib/credentials";

// Shopee Open Platform API v2.
// Docs: https://open.shopee.com/documents — sahkan endpoint terkini semasa go-live.

// Host berbeza ikut region.
const HOSTS: Record<string, string> = {
  MY: "https://partner.shopeemobile.com",
  SG: "https://partner.shopeemobile.com",
  ID: "https://partner.shopeemobile.com",
  TEST: "https://partner.test-stable.shopeemobile.com",
};

function host() {
  const region = (process.env.SHOPEE_REGION || "MY").toUpperCase();
  return HOSTS[region] ?? HOSTS.MY;
}
function partnerId() {
  const v = process.env.SHOPEE_PARTNER_ID;
  if (!v) throw new Error("SHOPEE_PARTNER_ID tidak diset");
  return v;
}
function partnerKey() {
  const v = process.env.SHOPEE_PARTNER_KEY;
  if (!v) throw new Error("SHOPEE_PARTNER_KEY tidak diset");
  return v;
}
function baseUrl() {
  return process.env.APP_BASE_URL || "http://localhost:3000";
}

// Tanda tangan Shopee (HMAC-SHA256 hex).
// Public API:  base = partner_id + path + timestamp
// Shop API:    base = partner_id + path + timestamp + access_token + shop_id
function sign(path: string, timestamp: number, accessToken?: string, shopId?: string): string {
  let base = `${partnerId()}${path}${timestamp}`;
  if (accessToken && shopId) base += `${accessToken}${shopId}`;
  return crypto.createHmac("sha256", partnerKey()).update(base).digest("hex");
}

// Link untuk seller authorize app ke kedai → Shopee redirect balik ke callback.
export function buildAuthUrl(): string {
  const path = "/api/v2/shop/auth_partner";
  const timestamp = Math.floor(Date.now() / 1000);
  const redirect = `${baseUrl()}/api/auth/shopee/callback`;
  const params = new URLSearchParams({
    partner_id: partnerId(),
    timestamp: String(timestamp),
    sign: sign(path, timestamp),
    redirect,
  });
  return `${host()}${path}?${params}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expire_in: number; // saat
  error?: string;
  message?: string;
};

// Tukar code + shop_id → access token (dalam callback).
export async function exchangeToken(code: string, shopId: string): Promise<ShopeeCreds> {
  const path = "/api/v2/auth/token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const url = `${host()}${path}?partner_id=${partnerId()}&timestamp=${timestamp}&sign=${sign(path, timestamp)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, shop_id: Number(shopId), partner_id: Number(partnerId()) }),
    cache: "no-store",
  });
  const json: TokenResponse = await res.json();
  if (json.error) throw new Error(`Shopee token error: ${json.message ?? json.error}`);
  return {
    shopId,
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    accessExpireAt: Date.now() + json.expire_in * 1000,
  };
}

async function refreshToken(creds: ShopeeCreds): Promise<ShopeeCreds> {
  const path = "/api/v2/auth/access_token/get";
  const timestamp = Math.floor(Date.now() / 1000);
  const url = `${host()}${path}?partner_id=${partnerId()}&timestamp=${timestamp}&sign=${sign(path, timestamp)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      refresh_token: creds.refreshToken,
      shop_id: Number(creds.shopId),
      partner_id: Number(partnerId()),
    }),
    cache: "no-store",
  });
  const json: TokenResponse = await res.json();
  if (json.error) throw new Error(`Shopee refresh error: ${json.message ?? json.error}`);
  const updated: ShopeeCreds = {
    ...creds,
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    accessExpireAt: Date.now() + json.expire_in * 1000,
  };
  await saveCredentials("shopee", updated);
  return updated;
}

async function getValidCreds(): Promise<ShopeeCreds> {
  const creds = await loadCredentials<ShopeeCreds>("shopee");
  if (!creds) throw new Error("Shopee belum di-authorize. Sila connect di Settings.");
  if (creds.accessExpireAt - Date.now() < 5 * 60 * 1000) {
    return refreshToken(creds);
  }
  return creds;
}

// Panggilan shop-level API bertandatangan.
async function shopRequest(
  method: "GET" | "POST",
  path: string,
  opts: { query?: Record<string, string>; body?: unknown } = {}
): Promise<Record<string, unknown>> {
  const creds = await getValidCreds();
  const timestamp = Math.floor(Date.now() / 1000);
  const query: Record<string, string> = {
    partner_id: partnerId(),
    timestamp: String(timestamp),
    access_token: creds.accessToken,
    shop_id: creds.shopId,
    sign: sign(path, timestamp, creds.accessToken, creds.shopId),
    ...(opts.query ?? {}),
  };
  const url = `${host()}${path}?${new URLSearchParams(query)}`;
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    cache: "no-store",
  });
  const json = await res.json();
  if (json.error) throw new Error(`Shopee API ${path} error: ${json.message ?? json.error}`);
  return json.response ?? json;
}

export type ShopeeOrderSummary = { order_sn: string; order_status: string };

// Senarai order yang perlu diproses (READY_TO_SHIP = perlu print AWB).
export async function getOrderList(status = "READY_TO_SHIP"): Promise<ShopeeOrderSummary[]> {
  const now = Math.floor(Date.now() / 1000);
  const data = await shopRequest("GET", "/api/v2/order/get_order_list", {
    query: {
      time_range_field: "create_time",
      time_from: String(now - 15 * 24 * 3600),
      time_to: String(now),
      page_size: "50",
      order_status: status,
    },
  });
  return (data.order_list as ShopeeOrderSummary[]) ?? [];
}

// AWB Shopee = 3 langkah: create → (tunggu) → download shipping document (PDF).
export async function createShippingDocument(orderSnList: string[]): Promise<void> {
  await shopRequest("POST", "/api/v2/logistics/create_shipping_document", {
    body: { order_list: orderSnList.map((sn) => ({ order_sn: sn })) },
  });
}

// Pulangkan PDF gabungan sebagai Buffer (untuk merge/print).
export async function downloadShippingDocument(orderSnList: string[]): Promise<Buffer> {
  const creds = await getValidCreds();
  const path = "/api/v2/logistics/download_shipping_document";
  const timestamp = Math.floor(Date.now() / 1000);
  const query = new URLSearchParams({
    partner_id: partnerId(),
    timestamp: String(timestamp),
    access_token: creds.accessToken,
    shop_id: creds.shopId,
    sign: sign(path, timestamp, creds.accessToken, creds.shopId),
  });
  const res = await fetch(`${host()}${path}?${query}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      shipping_document_type: "NORMAL_AIR_WAYBILL",
      order_list: orderSnList.map((sn) => ({ order_sn: sn })),
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Shopee download AWB gagal: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
