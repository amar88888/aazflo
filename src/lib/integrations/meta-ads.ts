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

export type MetaCreds = {
  accessToken: string;
  adAccountId: string;
  appId?: string;
  appSecret?: string;
  tokenSetAt?: number; // epoch ms bila token long-lived diperoleh (untuk auto-refresh)
};

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
  costPerPurchase: number; // spend / purchases (CPP)
  linkClicks: number;
  landingViews: number; // landing page views
  convRate: number; // purchases / landingViews (fallback link clicks) %
  // Video (hanya untuk level ad kalau kreatif video)
  thruplays: number; // 15s / complete
  videoViews3s: number; // 3s plays
  hookRate: number; // 3s views / impressions %
  holdRate: number; // thruplays / impressions %
};

// Baris prestasi kreatif — insight + thumbnail + status untuk grid visual.
export type MetaCreativePerf = MetaInsightRow & {
  thumbnailUrl: string | null;
  videoId: string | null;
};

export async function getMetaCreds(): Promise<MetaCreds | null> {
  const fromDb = await loadCredentials<MetaCreds>("meta");
  const accessToken = (fromDb?.accessToken || process.env.META_ACCESS_TOKEN || "").trim();
  let adAccountId = (fromDb?.adAccountId || process.env.META_AD_ACCOUNT_ID || "").trim();
  if (!accessToken || !adAccountId) return null;
  if (!adAccountId.startsWith("act_")) adAccountId = `act_${adAccountId}`;
  return {
    accessToken,
    adAccountId,
    appId: fromDb?.appId || process.env.META_APP_ID,
    appSecret: fromDb?.appSecret || process.env.META_APP_SECRET,
    tokenSetAt: fromDb?.tokenSetAt,
  };
}

export async function isMetaReady(): Promise<boolean> {
  return (await getMetaCreds()) !== null;
}

// ── Token kekal: tukar token pendek → long-lived (60 hari), auto-renew ──
// Facebook: GET /oauth/access_token?grant_type=fb_exchange_token&client_id&client_secret&fb_exchange_token
async function exchangeToLongLived(shortToken: string, appId: string, appSecret: string): Promise<string> {
  const qs = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: appId,
    client_secret: appSecret,
    fb_exchange_token: shortToken,
  });
  const res = await fetch(`${GRAPH}/oauth/access_token?${qs}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok || json.error || !json.access_token) {
    throw new Error(json.error?.message || `Tukar token gagal (HTTP ${res.status})`);
  }
  return json.access_token as string;
}

// Simpan token (tukar ke long-lived dulu kalau ada appId+appSecret).
export async function saveMetaToken(opts: {
  accessToken: string;
  adAccountId: string;
  appId?: string;
  appSecret?: string;
}): Promise<{ longLived: boolean }> {
  const { saveCredentials } = await import("@/lib/credentials");
  const existing = await loadCredentials<MetaCreds>("meta");
  const appId = (opts.appId || existing?.appId || process.env.META_APP_ID || "").trim();
  const appSecret = (opts.appSecret || existing?.appSecret || process.env.META_APP_SECRET || "").trim();
  let adAccountId = opts.adAccountId.trim();
  if (adAccountId && !adAccountId.startsWith("act_")) adAccountId = `act_${adAccountId}`;

  let token = opts.accessToken.trim();
  let longLived = false;
  if (appId && appSecret && token) {
    try {
      token = await exchangeToLongLived(token, appId, appSecret);
      longLived = true;
    } catch {
      // kalau gagal tukar (cth token dah long-lived / salah secret), simpan apa adanya
    }
  }
  await saveCredentials("meta", {
    accessToken: token,
    adAccountId: adAccountId || existing?.adAccountId || "",
    appId: appId || undefined,
    appSecret: appSecret || undefined,
    tokenSetAt: longLived ? Date.now() : existing?.tokenSetAt,
  });
  return { longLived };
}

// Auto-renew: tukar token long-lived semasa kepada token 60-hari baru.
// Dipanggil cron. Hanya refresh kalau token dah lebih tua dari `minAgeDays`.
export async function refreshMetaToken(minAgeDays = 0): Promise<{ ok: boolean; message: string }> {
  const creds = await loadCredentials<MetaCreds>("meta");
  if (!creds?.accessToken) return { ok: false, message: "Meta belum di-setup." };
  const appId = creds.appId || process.env.META_APP_ID;
  const appSecret = creds.appSecret || process.env.META_APP_SECRET;
  if (!appId || !appSecret) return { ok: false, message: "App ID / App Secret tiada — tak boleh auto-refresh." };

  const ageMs = creds.tokenSetAt ? Date.now() - creds.tokenSetAt : Infinity;
  if (ageMs < minAgeDays * 86400000) {
    return { ok: true, message: "Token masih baru, tak perlu refresh." };
  }
  try {
    const fresh = await exchangeToLongLived(creds.accessToken, appId, appSecret);
    const { saveCredentials } = await import("@/lib/credentials");
    await saveCredentials("meta", { ...creds, accessToken: fresh, tokenSetAt: Date.now() });
    return { ok: true, message: "Token Meta di-refresh (60 hari lagi)." };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

// ── Helper: ambil value action MENGIKUT KEUTAMAAN (bukan campur) ──
// Meta report pembelian yang SAMA di bawah banyak action_type (purchase,
// omni_purchase, offsite_conversion.fb_pixel_purchase, dll) — semua nilai sama.
// Kalau kita campur, jadi 4x ganda. Jadi ambil YANG PERTAMA wujud ikut keutamaan.
function pickFirst(
  arr: Array<{ action_type: string; value: string }> | undefined,
  typesByPriority: string[]
): number {
  if (!arr) return 0;
  for (const t of typesByPriority) {
    const hit = arr.find((a) => a.action_type === t);
    if (hit) return Number(hit.value) || 0;
  }
  return 0;
}

// Keutamaan jenis pembelian — ambil satu je (omni_purchase = gabungan Meta).
const PURCHASE_PRIORITY = [
  "omni_purchase",
  "purchase",
  "offsite_conversion.fb_pixel_purchase",
  "onsite_web_purchase",
];
const V3S_TYPES = ["video_view"];
const THRUPLAY_TYPES = ["video_thruplay_watched_actions", "video_view_15s"];
const LPV_PRIORITY = ["landing_page_view", "omni_landing_page_view"];
const LINKCLICK_PRIORITY = ["link_click"];

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
  const purchases = pickFirst(row.actions, PURCHASE_PRIORITY);
  const purchaseValue = pickFirst(row.action_values, PURCHASE_PRIORITY);
  const videoViews3s = pickFirst(row.actions, V3S_TYPES);
  const thruplays = pickFirst(row.video_thruplay_watched_actions, THRUPLAY_TYPES);
  const landingViews = pickFirst(row.actions, LPV_PRIORITY);
  const linkClicks = pickFirst(row.actions, LINKCLICK_PRIORITY);
  const convBase = landingViews || linkClicks;
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
    linkClicks,
    landingViews,
    convRate: convBase > 0 ? (purchases / convBase) * 100 : 0,
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

// ── Ambil senarai ad + thumbnail kreatif (untuk grid visual) ──
type RawAd = {
  id: string;
  name?: string;
  effective_status?: string;
  creative?: { thumbnail_url?: string; name?: string; video_id?: string };
};

type AdCreative = {
  name: string;
  status: string;
  thumbnailUrl: string | null;
  videoId: string | null;
};

async function fetchAdCreatives(): Promise<Map<string, AdCreative>> {
  const creds = await getMetaCreds();
  if (!creds) throw new Error("Meta Ads belum di-setup.");
  const map = new Map<string, AdCreative>();
  const base: Record<string, string> = {
    fields: "id,name,effective_status,creative{thumbnail_url,name,video_id}",
    limit: "200",
  };
  let params = base;
  for (let i = 0; i < 10; i++) {
    const json = await graphGet(`${creds.adAccountId}/ads`, params, creds.accessToken);
    const data: RawAd[] = json.data ?? [];
    for (const ad of data) {
      map.set(ad.id, {
        name: ad.creative?.name || ad.name || "(tiada nama)",
        status: ad.effective_status ?? "",
        thumbnailUrl: ad.creative?.thumbnail_url ?? null,
        videoId: ad.creative?.video_id ?? null,
      });
    }
    const next = json.paging?.cursors?.after;
    if (!next || data.length === 0) break;
    params = { ...base, after: next };
  }
  return map;
}

// Prestasi setiap kreatif (ad) — insight + thumbnail, untuk grid visual.
export async function fetchCreativePerformance(opts: {
  datePreset?: MetaDatePreset;
}): Promise<MetaCreativePerf[]> {
  const [insights, creatives] = await Promise.all([
    fetchInsights({ level: "ad", datePreset: opts.datePreset }),
    fetchAdCreatives().catch(() => new Map<string, AdCreative>()),
  ]);
  return insights.map((r) => {
    const c = creatives.get(r.id);
    return {
      ...r,
      name: c?.name || r.name,
      status: c?.status || r.status,
      thumbnailUrl: c?.thumbnailUrl ?? null,
      videoId: c?.videoId ?? null,
    };
  });
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
