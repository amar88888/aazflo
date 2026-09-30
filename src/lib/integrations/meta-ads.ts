// Integrasi Meta (Facebook/Instagram) Ads — tarik insight ads: spend, ROAS,
// purchases, video metrics. Guna Marketing API (Graph API).
//
// Kredential:
//   - accessToken : long-lived / System User token dengan permission `ads_read`
//   - adAccountId : ID akaun iklan, format "act_XXXXXXXXXX"
// Sumber: DB (ApiCredential 'meta', encrypted) ATAU env META_ACCESS_TOKEN / META_AD_ACCOUNT_ID.
import { loadCredentials } from "@/lib/credentials";

const GRAPH_VERSION = "v21.0";
const GRAPH = `https://graph.facebook.com/${GRAPH_VERSION}`;

export type MetaCreds = { accessToken: string; adAccountId: string };

export type MetaDatePreset =
  | "today"
  | "yesterday"
  | "last_7d"
  | "last_14d"
  | "last_30d"
  | "maximum";

// Satu baris insight (campaign / adset / ad) yang dah dinormalisasi.
export type MetaInsightRow = {
  id: string; // campaign_id / ad_id
  name: string; // campaign_name / ad_name
  status?: string; // effective_status (ACTIVE/PAUSED/…)
  spend: number; // RM
  impressions: number;
  clicks: number;
  ctr: number; // %
  reach: number;
  purchases: number; // jumlah pembelian
  purchaseValue: number; // nilai jualan RM
  roas: number; // purchaseValue / spend
  costPerPurchase: number; // spend / purchases
  // Video (hanya untuk level ad kalau kreatif video)
  thruplays: number; // 15s / complete
  videoViews3s: number; // 3s plays
  hookRate: number; // 3s views / impressions %
  holdRate: number; // thruplays / impressions %
};

export async function getMetaCreds(): Promise<MetaCreds | null> {
  const fromDb = await loadCredentials<MetaCreds>("meta");
  const accessToken = (fromDb?.accessToken || process.env.META_ACCESS_TOKEN || "").trim();
  let adAccountId = (fromDb?.adAccountId || process.env.META_AD_ACCOUNT_ID || "").trim();
  if (!accessToken || !adAccountId) return null;
  if (!adAccountId.startsWith("act_")) adAccountId = `act_${adAccountId}`;
  return { accessToken, adAccountId };
}

export async function isMetaReady(): Promise<boolean> {
  return (await getMetaCreds()) !== null;
}

// ── Helper: cari value dalam array actions/action_values ──
function pickAction(
  arr: Array<{ action_type: string; value: string }> | undefined,
  types: string[]
): number {
  if (!arr) return 0;
  let sum = 0;
  for (const a of arr) {
    if (types.includes(a.action_type)) sum += Number(a.value) || 0;
  }
  return sum;
}

// Jenis action pembelian yang mungkin (web pixel / offsite).
const PURCHASE_TYPES = [
  "purchase",
  "omni_purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_web_purchase",
];
const V3S_TYPES = ["video_view"];
const THRUPLAY_TYPES = ["video_thruplay_watched_actions"];

type RawInsight = {
  campaign_id?: string;
  campaign_name?: string;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  effective_status?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  reach?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
  video_thruplay_watched_actions?: Array<{ action_type: string; value: string }>;
};

function normalize(row: RawInsight, level: "campaign" | "adset" | "ad"): MetaInsightRow {
  const id = level === "campaign" ? row.campaign_id : level === "adset" ? row.adset_id : row.ad_id;
  const name =
    level === "campaign" ? row.campaign_name : level === "adset" ? row.adset_name : row.ad_name;
  const spend = Number(row.spend) || 0;
  const impressions = Number(row.impressions) || 0;
  const purchases = pickAction(row.actions, PURCHASE_TYPES);
  const purchaseValue = pickAction(row.action_values, PURCHASE_TYPES);
  const videoViews3s = pickAction(row.actions, V3S_TYPES);
  const thruplays = pickAction(row.video_thruplay_watched_actions, THRUPLAY_TYPES);
  return {
    id: id ?? "",
    name: name ?? "(tiada nama)",
    status: row.effective_status,
    spend,
    impressions,
    clicks: Number(row.clicks) || 0,
    ctr: Number(row.ctr) || 0,
    reach: Number(row.reach) || 0,
    purchases,
    purchaseValue,
    roas: spend > 0 ? purchaseValue / spend : 0,
    costPerPurchase: purchases > 0 ? spend / purchases : 0,
    thruplays,
    videoViews3s,
    hookRate: impressions > 0 ? (videoViews3s / impressions) * 100 : 0,
    holdRate: impressions > 0 ? (thruplays / impressions) * 100 : 0,
  };
}

async function graphGet(path: string, params: Record<string, string>, token: string) {
  const qs = new URLSearchParams({ ...params, access_token: token });
  const res = await fetch(`${GRAPH}/${path}?${qs}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json.error) {
    const msg = json.error?.message || `HTTP ${res.status}`;
    throw new Error(`Meta API: ${msg}`);
  }
  return json;
}

const INSIGHT_FIELDS = [
  "campaign_id",
  "campaign_name",
  "adset_id",
  "adset_name",
  "ad_id",
  "ad_name",
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "reach",
  "actions",
  "action_values",
  "video_thruplay_watched_actions",
].join(",");

// Tarik insight pada level tertentu (campaign / adset / ad).
export async function fetchInsights(opts: {
  level: "campaign" | "adset" | "ad";
  datePreset?: MetaDatePreset;
  since?: string; // YYYY-MM-DD (guna kalau tak nak preset)
  until?: string;
  limit?: number;
}): Promise<MetaInsightRow[]> {
  const creds = await getMetaCreds();
  if (!creds) throw new Error("Meta Ads belum di-setup (token / ad account ID).");

  const params: Record<string, string> = {
    level: opts.level,
    fields: INSIGHT_FIELDS,
    limit: String(opts.limit ?? 200),
  };
  if (opts.since && opts.until) {
    params.time_range = JSON.stringify({ since: opts.since, until: opts.until });
  } else {
    params.date_preset = opts.datePreset ?? "last_7d";
  }

  const rows: MetaInsightRow[] = [];
  let path = `${creds.adAccountId}/insights`;
  let cursorParams: Record<string, string> = params;
  // Pagination (ikut next cursor) — max 10 page.
  for (let i = 0; i < 10; i++) {
    const json = await graphGet(path, cursorParams, creds.accessToken);
    const data: RawInsight[] = json.data ?? [];
    for (const r of data) rows.push(normalize(r, opts.level));
    const next = json.paging?.cursors?.after;
    if (!next || data.length === 0) break;
    cursorParams = { ...params, after: next };
    path = `${creds.adAccountId}/insights`;
  }
  return rows;
}

// Ringkasan akaun (jumlah keseluruhan) untuk kad atas dashboard.
export type MetaSummary = {
  spend: number;
  purchases: number;
  purchaseValue: number;
  roas: number;
  impressions: number;
  clicks: number;
  ctr: number;
};

export function summarize(rows: MetaInsightRow[]): MetaSummary {
  const spend = rows.reduce((s, r) => s + r.spend, 0);
  const purchases = rows.reduce((s, r) => s + r.purchases, 0);
  const purchaseValue = rows.reduce((s, r) => s + r.purchaseValue, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  return {
    spend,
    purchases,
    purchaseValue,
    roas: spend > 0 ? purchaseValue / spend : 0,
    impressions,
    clicks,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
  };
}

// Test sambungan cepat — pulangkan nama akaun kalau token sah.
export async function testMetaConnection(): Promise<{ ok: boolean; message: string }> {
  const creds = await getMetaCreds();
  if (!creds) return { ok: false, message: "Token / Ad Account ID belum diisi." };
  try {
    const json = await graphGet(creds.adAccountId, { fields: "name,currency,account_status" }, creds.accessToken);
    return { ok: true, message: `Connected: ${json.name} (${json.currency})` };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
