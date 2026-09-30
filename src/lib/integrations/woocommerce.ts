// WooCommerce REST API client — guna consumer key/secret (basic auth).
// Generate key: WP Admin → WooCommerce → Settings → Advanced → REST API.

export type WooConfig = {
  url: string;
  consumerKey: string;
  consumerSecret: string;
};

export type WooOrder = {
  id: number;
  status: string;
  total: string;
  shipping_total: string;
  date_created: string;
  billing: { first_name: string; last_name: string };
  line_items: {
    name: string;
    sku: string;
    quantity: number;
    price: number | string;
  }[];
  meta_data?: { key: string; value: unknown }[];
};

// Ambil nombor tracking NinjaVan dari meta order (plugin Ninja Van WooCommerce).
export function getNinjaTracking(order: WooOrder): string | null {
  const meta = order.meta_data ?? [];
  const hit = meta.find((m) => m.key === "ninja_van_tracking_number" || m.key === "_ninja_van_tracking_number");
  const v = hit?.value;
  if (typeof v === "string" && v.trim()) return v.trim();
  return null;
}

export type TrackingEvent = { stage: string; at: string }; // at = ISO string

// Parser ringkas PHP-serialize untuk array string=>string (guna byte-length).
// Cth: a:1:{s:14:"pending pickup";s:19:"2026-09-30 07:49:48";}
function phpStringTokens(s: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < s.length) {
    const m = /^s:(\d+):"/.exec(s.slice(i));
    if (m) {
      const len = parseInt(m[1], 10);
      const start = i + m[0].length;
      tokens.push(s.slice(start, start + len));
      i = start + len + 2; // lepas tutup " dan ;
    } else {
      i++;
    }
  }
  return tokens;
}

// Perjalanan parcel NinjaVan dari meta _ninja_van_events → senarai event.
export function getNinjaEvents(order: WooOrder): TrackingEvent[] {
  const meta = order.meta_data ?? [];
  const hit = meta.find((m) => m.key === "_ninja_van_events" || m.key === "ninja_van_events");
  const raw = hit?.value;
  if (typeof raw !== "string" || !raw.includes("{")) return [];
  const toks = phpStringTokens(raw);
  const events: TrackingEvent[] = [];
  for (let i = 0; i + 1 < toks.length; i += 2) {
    const stage = toks[i];
    const dt = toks[i + 1];
    const parsed = new Date(dt.replace(" ", "T") + "Z");
    events.push({ stage, at: isNaN(parsed.getTime()) ? dt : parsed.toISOString() });
  }
  // Susun ikut masa menaik
  events.sort((a, b) => a.at.localeCompare(b.at));
  return events;
}

// Map status NinjaVan → deliveryStatus + returnStatus dalaman.
export function mapNinjaDelivery(
  wooStatus: string
): { deliveryStatus: string; returnStatus?: string } | null {
  if (!wooStatus.startsWith("nv-")) return null;
  const s = wooStatus;
  if (s.includes("return") || s === "nv-rts") return { deliveryStatus: "returned", returnStatus: "returned" };
  if (s.includes("delivered") || s.includes("completed") || s.includes("successful"))
    return { deliveryStatus: "delivered" };
  if (s.includes("out-for-delivery") || s.includes("on-vehicle")) return { deliveryStatus: "out_for_delivery" };
  if (s.includes("hold") || s.includes("fail") || s.includes("reschedule") || s.includes("exception"))
    return { deliveryStatus: "failed" };
  if (s === "nv-pending-pickup" || s.includes("pending-pickup")) return { deliveryStatus: "pending" };
  return { deliveryStatus: "in_transit" }; // picked-up, in-transit, hub, transferred, dll
}

export function getWooConfigFromEnv(): WooConfig | null {
  const url = process.env.WOOCOMMERCE_URL;
  const consumerKey = process.env.WOOCOMMERCE_CONSUMER_KEY;
  const consumerSecret = process.env.WOOCOMMERCE_CONSUMER_SECRET;
  if (!url || !consumerKey || !consumerSecret) return null;
  return { url: url.replace(/\/$/, ""), consumerKey, consumerSecret };
}

export async function fetchWooOrders(
  config: WooConfig,
  opts: { after?: Date; page?: number } = {}
): Promise<WooOrder[]> {
  const params = new URLSearchParams({
    per_page: "100",
    page: String(opts.page ?? 1),
    orderby: "date",
    order: "desc",
  });
  if (opts.after) params.set("after", opts.after.toISOString());

  const auth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString("base64");
  const res = await fetch(`${config.url}/wp-json/wc/v3/orders?${params}`, {
    headers: {
      Authorization: `Basic ${auth}`,
      // Sesetengah WAF (cth maxlim.shop) blok request tanpa User-Agent.
      "User-Agent": "Aazflo/1.0 (+https://aazflo.com)",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`WooCommerce API error ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

// Map status WooCommerce → status dalaman BizOps.
// Termasuk status khas plugin Ninja Van (nv-*) — bila AWB dijana, status Woo
// jadi "nv-pending-pickup" dsb, jadi kita kena kenal supaya tanda "printed".
export function mapWooStatus(wooStatus: string): string {
  // Status Ninja Van (plugin WooCommerce)
  if (wooStatus.startsWith("nv-")) {
    switch (wooStatus) {
      case "nv-pending-pickup":
        return "printed"; // AWB dah dijana, tunggu pickup
      case "nv-cancelled":
      case "nv-returned-to-sender":
      case "nv-return-to-sender":
      case "nv-rts":
      case "nv-on-hold": // masalah penghantaran — anggap perlu perhatian, bukan selesai
        return wooStatus === "nv-on-hold" ? "shipped" : "cancelled";
      case "nv-completed":
      case "nv-delivered":
      case "nv-successful-delivery":
        return "completed";
      default:
        // nv-picked-up, nv-in-transit, nv-arrived-*, nv-out-for-delivery, dll
        return "shipped";
    }
  }
  switch (wooStatus) {
    case "cancelled":
    case "refunded":
    case "failed":
    case "trash":
      return "cancelled";
    case "completed":
      return "completed";
    case "processing":
      return "pending"; // dah bayar, belum hantar → perlu proses/AWB
    default:
      return "pending";
  }
}
