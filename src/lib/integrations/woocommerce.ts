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
