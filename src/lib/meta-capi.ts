import { createHash } from "node:crypto";
import { getMetaCreds } from "@/lib/integrations/meta-ads";
import { setSetting } from "@/lib/settings";
import type { WooOrder } from "@/lib/integrations/woocommerce";

const GRAPH = "https://graph.facebook.com/v21.0";

// Kedai → pixel iklan + awalan eventID. Awalan MESTI sama dengan pixel browser (snippet #22 tiap kedai)
// supaya Meta gabung event browser + server (dedup), bukan kira berganda.
const STORES: Record<string, { pixel: string; prefix: string; site: string; country: string }> = {
  facelim: { pixel: "1107391808487682", prefix: "flmy_", site: "https://facelim.com/", country: "my" },
  facelimsg: { pixel: "1228069215467379", prefix: "flsg_", site: "https://facelimsg.com/", country: "sg" },
};

const sha = (v: string) => createHash("sha256").update(v).digest("hex");
const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();
const hashed = (v: unknown) => (norm(v) ? [sha(norm(v))] : undefined);

// Telefon → format antarabangsa tanpa + (Meta mahu digit sahaja, dengan kod negara).
function normPhone(raw: unknown, country: string): string {
  let d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return "";
  if (country === "my") {
    if (d.startsWith("0")) d = "6" + d; // 012... → 6012...
    else if (!d.startsWith("60")) d = "60" + d;
  } else if (country === "sg") {
    if (d.length === 8) d = "65" + d;
  }
  return d;
}

export type CapiOrder = WooOrder & {
  currency?: string;
  date_created_gmt?: string;
  customer_id?: number;
  customer_ip_address?: string;
  customer_user_agent?: string;
  billing: WooOrder["billing"] & {
    email?: string;
    phone?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  line_items: (WooOrder["line_items"][number] & { product_id?: number })[];
};

// 📡 META CAPI — hantar Purchase dari server untuk setiap order sah (lengkapi pixel browser yang
// disekat iOS/ad-blocker). Data pembeli di-hash SHA-256 seperti dikehendaki Meta.
export async function sendPurchaseCapi(wo: CapiOrder, store: string): Promise<{ sent: boolean; detail: string }> {
  const cfg = STORES[store];
  if (!cfg) return { sent: false, detail: `kedai ${store} tiada pixel CAPI` };
  const creds = await getMetaCreds();
  if (!creds) return { sent: false, detail: "Meta belum di-setup" };

  const meta = (k: string) => (wo.meta_data ?? []).find((m) => m.key === k)?.value as string | undefined;
  const country = norm(wo.billing?.country) || cfg.country;
  const phone = normPhone(wo.billing?.phone, country);
  const paid = wo.date_paid_gmt || wo.date_created_gmt;
  const eventTime = paid ? Math.floor(new Date(paid + "Z").getTime() / 1000) : Math.floor(Date.now() / 1000);

  const event = {
    event_name: "Purchase",
    event_time: Math.min(eventTime, Math.floor(Date.now() / 1000)),
    event_id: `${cfg.prefix}${wo.id}`,
    action_source: "website",
    event_source_url: cfg.site,
    user_data: {
      em: hashed(wo.billing?.email),
      ph: phone ? [sha(phone)] : undefined,
      fn: hashed(wo.billing?.first_name),
      ln: hashed(wo.billing?.last_name),
      ct: hashed(norm(wo.billing?.city).replace(/\s+/g, "")),
      st: hashed(norm(wo.billing?.state).replace(/\s+/g, "")),
      zp: hashed(norm(wo.billing?.postcode).replace(/\s+/g, "")),
      country: [sha(country)],
      external_id: phone ? [sha(phone)] : wo.customer_id ? [sha(String(wo.customer_id))] : undefined,
      client_ip_address: wo.customer_ip_address || undefined,
      client_user_agent: wo.customer_user_agent || undefined,
      fbp: meta("aazflo_fbp") || undefined,
      fbc: meta("aazflo_fbc") || undefined,
    },
    custom_data: {
      currency: (wo.currency || (country === "sg" ? "SGD" : "MYR")).toUpperCase(),
      value: Number(wo.total) || 0,
      content_type: "product",
      // product_id sama dgn content_ids pixel browser (snippet #22)
      content_ids: wo.line_items.map((li) => String((li as { product_id?: number }).product_id ?? li.sku ?? li.name)),
      num_items: wo.line_items.reduce((s, li) => s + (li.quantity || 0), 0),
      order_id: String(wo.id),
    },
  };

  const r = await fetch(`${GRAPH}/${cfg.pixel}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ data: JSON.stringify([event]), access_token: creds.accessToken }).toString(),
  });
  const j = await r.json().catch(() => ({}));
  const sent = r.ok && Number(j.events_received) === 1;
  const detail = sent ? `ok ${event.event_id}` : `gagal ${event.event_id}: ${j.error?.message ?? r.status}`;
  // Rekod terakhir untuk semakan (/api/cron/capi-status)
  await setSetting(
    "capi_last",
    JSON.stringify({ at: new Date().toISOString(), store, sent, detail, match: Object.keys(event.user_data).filter((k) => (event.user_data as Record<string, unknown>)[k]) })
  ).catch(() => {});
  return { sent, detail };
}
