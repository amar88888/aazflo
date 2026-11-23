import crypto from "crypto";
import { loadCredentials } from "@/lib/credentials";

// WhatsApp Cloud API (rasmi Meta).
// Simpan kredential dalam ApiCredential 'whatsapp' (encrypted).
export type WhatsAppCreds = {
  accessToken: string; // token system-user/permanent (whatsapp_business_messaging)
  phoneNumberId: string; // Phone Number ID (bukan nombor telefon)
  wabaId?: string; // WhatsApp Business Account ID (opsyenal)
  verifyToken?: string; // token pengesahan webhook (kita jana sendiri)
  appSecret?: string; // App Secret — sahkan signature webhook (X-Hub-Signature-256)
  displayNumber?: string; // nombor paparan (untuk rujukan sahaja)
};

const GRAPH = "https://graph.facebook.com/v22.0";

export async function getWhatsAppConfig(): Promise<WhatsAppCreds | null> {
  const c = await loadCredentials<WhatsAppCreds>("whatsapp");
  if (!c?.accessToken || !c?.phoneNumberId) return null;
  return c;
}

export async function isWhatsAppReady(): Promise<boolean> {
  return !!(await getWhatsAppConfig());
}

// Hantar mesej teks (free-form). SAH hanya dalam tetingkap 24 jam selepas
// mesej MASUK terakhir daripada pelanggan; di luar tu Meta tolak (perlu template).
export async function sendWhatsAppText(
  to: string,
  body: string,
): Promise<{ ok: boolean; waMsgId?: string; error?: string }> {
  const cfg = await getWhatsAppConfig();
  if (!cfg) return { ok: false, error: "WhatsApp belum di-setup." };
  try {
    const res = await fetch(`${GRAPH}/${cfg.phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: { preview_url: false, body },
      }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string; error_data?: { details?: string } };
    };
    if (!res.ok || json.error) {
      const e = json.error;
      return {
        ok: false,
        error: e?.error_data?.details || e?.message || `HTTP ${res.status}`,
      };
    }
    return { ok: true, waMsgId: json.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Ralat rangkaian." };
  }
}

// Sahkan signature webhook Meta (X-Hub-Signature-256 = HMAC-SHA256(raw, appSecret)).
// Pulang true kalau tiada appSecret diset (skip — tapi digalakkan set).
export function verifyWhatsAppSignature(raw: string, signature: string | null, appSecret?: string): boolean {
  if (!appSecret) return true; // belum set — jangan sekat (tapi kurang selamat)
  if (!signature) return false;
  const expected =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(raw, "utf8").digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── Auto-setup: dari SATU token, cari WABA + Phone Number ID, langgan app ke WABA,
// dan (kalau ada appId+appSecret) daftar webhook callback di peringkat app.
// Pengguna hanya perlu paste token — tak perlu cari ID atau klik dalam Meta.
type GraphErr = { error?: { message?: string } };
async function gget<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T & GraphErr> {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}/${path}?${qs}`);
  return (await res.json().catch(() => ({}))) as T & GraphErr;
}
async function gpost<T>(path: string, token: string, params: Record<string, string> = {}): Promise<T & GraphErr> {
  const body = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}/${path}`, { method: "POST", body });
  return (await res.json().catch(() => ({}))) as T & GraphErr;
}

export type WaPhone = { id: string; display_phone_number?: string; verified_name?: string; quality_rating?: string; wabaId: string };

export async function discoverWhatsApp(
  token: string,
  appToken?: string,
): Promise<{ ok: boolean; phones: WaPhone[]; tokenAppId?: string; scopes: string[]; error?: string }> {
  const dbg = await gget<{
    data?: { app_id?: string; scopes?: string[]; granular_scopes?: { scope: string; target_ids?: string[] }[]; is_valid?: boolean };
  }>("debug_token", appToken || token, { input_token: token });
  if (dbg.error) return { ok: false, phones: [], scopes: [], error: dbg.error.message };
  const d = dbg.data ?? {};
  const scopes = d.scopes ?? [];
  if (d.is_valid === false) return { ok: false, phones: [], scopes, error: "Token tak sah / dah tamat." };
  if (!scopes.includes("whatsapp_business_messaging") && !scopes.includes("whatsapp_business_management")) {
    return { ok: false, phones: [], scopes, tokenAppId: d.app_id, error: "Token tiada permission WhatsApp (perlu whatsapp_business_messaging + whatsapp_business_management)." };
  }
  const wabaIds = new Set<string>();
  for (const g of d.granular_scopes ?? []) {
    if (g.scope.startsWith("whatsapp_business")) (g.target_ids ?? []).forEach((t) => wabaIds.add(t));
  }
  const phones: WaPhone[] = [];
  for (const waba of wabaIds) {
    const r = await gget<{ data?: Omit<WaPhone, "wabaId">[] }>(`${waba}/phone_numbers`, token, {
      fields: "id,display_phone_number,verified_name,quality_rating",
    });
    for (const p of r.data ?? []) phones.push({ ...p, wabaId: waba });
  }
  return { ok: phones.length > 0, phones, scopes, tokenAppId: d.app_id, error: phones.length ? undefined : "Tiada nombor WhatsApp dijumpai dalam akaun yang token ni boleh akses." };
}

// Langgan app (pemilik token) ke WABA supaya webhook mesej sampai.
export async function subscribeAppToWaba(wabaId: string, token: string): Promise<{ ok: boolean; error?: string }> {
  const r = await gpost<{ success?: boolean }>(`${wabaId}/subscribed_apps`, token);
  return r.success ? { ok: true } : { ok: false, error: r.error?.message ?? "Gagal langgan WABA." };
}

// Daftar callback webhook di peringkat app (sekali sahaja). Meta akan terus GET
// callback untuk sahkan verify token — jadi creds MESTI dah disimpan dulu.
export async function registerAppWebhook(
  appId: string,
  appSecret: string,
  callbackUrl: string,
  verifyToken: string,
): Promise<{ ok: boolean; error?: string }> {
  const r = await gpost<{ success?: boolean }>(`${appId}/subscriptions`, `${appId}|${appSecret}`, {
    object: "whatsapp_business_account",
    callback_url: callbackUrl,
    verify_token: verifyToken,
    fields: "messages",
  });
  return r.success ? { ok: true } : { ok: false, error: r.error?.message ?? "Gagal daftar webhook." };
}

// Betul-betulkan nombor WA jadi format antarabangsa tanpa '+' / ruang.
export function normalizeWaId(num: string): string {
  return (num || "").replace(/[^0-9]/g, "");
}

// Betul nombor MY tempatan (0123…) → 60123…  (bantuan bila hantar manual)
export function toWaId(num: string): string {
  let n = normalizeWaId(num);
  if (n.startsWith("0")) n = "60" + n.slice(1);
  return n;
}
