import crypto from "crypto";
import { loadCredentials, saveCredentials, type TikTokCreds } from "@/lib/credentials";

// TikTok Shop Partner API (versi 202309+).
// Docs: https://partner.tiktokshop.com/docv2  — sahkan versi endpoint terkini semasa go-live.

const API_BASE = "https://open-api.tiktokglobalshop.com";
const AUTH_BASE = "https://auth.tiktok-shops.com";
const SERVICES_BASE = "https://services.tiktokshop.com";

function appKey() {
  const v = process.env.TIKTOK_APP_KEY;
  if (!v) throw new Error("TIKTOK_APP_KEY tidak diset");
  return v;
}
function appSecret() {
  const v = process.env.TIKTOK_APP_SECRET;
  if (!v) throw new Error("TIKTOK_APP_SECRET tidak diset");
  return v;
}

// Tanda tangan permintaan (HMAC-SHA256):
// signString = path + setiap (key+value) param disusun ikut abjad (exclude sign & access_token),
// + body (kalau ada). Wrap dengan app_secret di depan & belakang.
function sign(path: string, query: Record<string, string>, body?: string): string {
  const secret = appSecret();
  const keys = Object.keys(query)
    .filter((k) => k !== "sign" && k !== "access_token")
    .sort();
  let str = path;
  for (const k of keys) str += k + query[k];
  if (body) str += body;
  const wrapped = secret + str + secret;
  return crypto.createHmac("sha256", secret).update(wrapped).digest("hex");
}

// Bina URL authorization untuk seller benarkan app akses kedai.
export function buildAuthUrl(state: string): string {
  const params = new URLSearchParams({
    service_id: appKey(),
    state,
  });
  return `${SERVICES_BASE}/open/authorize?${params}`;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  access_token_expire_in: number; // saat
  seller_name?: string;
  open_id?: string;
};

// Tukar auth_code → access token (dipanggil dalam callback).
export async function exchangeToken(authCode: string): Promise<TikTokCreds> {
  const url = new URL(`${AUTH_BASE}/api/v2/token/get`);
  url.searchParams.set("app_key", appKey());
  url.searchParams.set("app_secret", appSecret());
  url.searchParams.set("auth_code", authCode);
  url.searchParams.set("grant_type", "authorized_code");

  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`TikTok token error: ${json.message ?? JSON.stringify(json)}`);
  const data: TokenResponse = json.data;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessExpireAt: Date.now() + data.access_token_expire_in * 1000,
  };
}

async function refreshToken(creds: TikTokCreds): Promise<TikTokCreds> {
  const url = new URL(`${AUTH_BASE}/api/v2/token/refresh`);
  url.searchParams.set("app_key", appKey());
  url.searchParams.set("app_secret", appSecret());
  url.searchParams.set("refresh_token", creds.refreshToken);
  url.searchParams.set("grant_type", "refresh_token");

  const res = await fetch(url, { cache: "no-store" });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`TikTok refresh error: ${json.message ?? JSON.stringify(json)}`);
  const data: TokenResponse = json.data;
  const updated: TikTokCreds = {
    ...creds,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    accessExpireAt: Date.now() + data.access_token_expire_in * 1000,
  };
  await saveCredentials("tiktok", updated);
  return updated;
}

async function getValidCreds(): Promise<TikTokCreds> {
  const creds = await loadCredentials<TikTokCreds>("tiktok");
  if (!creds) throw new Error("TikTok belum di-authorize. Sila connect di Settings.");
  // Refresh awal kalau tinggal < 5 minit
  if (creds.accessExpireAt - Date.now() < 5 * 60 * 1000) {
    return refreshToken(creds);
  }
  return creds;
}

// Panggilan API bertandatangan dengan access token.
async function apiRequest(
  method: "GET" | "POST",
  path: string,
  opts: { query?: Record<string, string>; body?: unknown } = {}
): Promise<Record<string, unknown>> {
  const creds = await getValidCreds();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const query: Record<string, string> = {
    app_key: appKey(),
    timestamp,
    ...(opts.query ?? {}),
  };
  if (creds.shopCipher) query.shop_cipher = creds.shopCipher;

  const bodyStr = opts.body ? JSON.stringify(opts.body) : undefined;
  query.sign = sign(path, query, bodyStr);

  const url = `${API_BASE}${path}?${new URLSearchParams(query)}`;
  const res = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      "x-tts-access-token": creds.accessToken,
    },
    body: bodyStr,
    cache: "no-store",
  });
  const json = await res.json();
  if (json.code !== 0) throw new Error(`TikTok API ${path} error: ${json.message ?? JSON.stringify(json)}`);
  return json.data;
}

export type TikTokOrder = {
  id: string;
  status: string;
  buyer_email?: string;
  create_time: number;
  payment?: { total_amount?: string; currency?: string };
  line_items?: { product_name: string; seller_sku?: string; sku_id?: string; quantity?: number; sale_price?: string }[];
};

// Ambil senarai order (default: yang perlu dihantar = AWAITING_SHIPMENT).
export async function getOrders(status = "AWAITING_SHIPMENT"): Promise<TikTokOrder[]> {
  const data = await apiRequest("POST", "/order/202309/orders/search", {
    query: { page_size: "50" },
    body: { order_status: status },
  });
  return (data.orders as TikTokOrder[]) ?? [];
}

// Download shipping document (AWB) untuk satu order — pulangkan URL PDF.
export async function getShippingDocumentUrl(orderId: string, documentType = "SHIPPING_LABEL"): Promise<string> {
  const data = await apiRequest("GET", `/fulfillment/202309/orders/${orderId}/shipping_documents`, {
    query: { document_type: documentType, document_size: "A6" },
  });
  return (data.doc_url as string) ?? "";
}
