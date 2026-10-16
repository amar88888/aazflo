// Stripe (read-only) — jejak duit kad: payout ke bank, balance, fees.
// Sumber key: DB (ApiCredential 'stripe', { secretKey }) ATAU env STRIPE_SECRET_KEY.
// Guna restricted key (rk_live_...) read-only: Balance, Balance transactions, Charges, Payouts.
import { loadCredentials } from "@/lib/credentials";

const STRIPE_API = "https://api.stripe.com/v1";

type StripeCreds = { secretKey?: string };

export async function getStripeKey(): Promise<string | null> {
  const fromDb = await loadCredentials<StripeCreds>("stripe");
  const key = (fromDb?.secretKey || process.env.STRIPE_SECRET_KEY || "").trim();
  return key || null;
}

export async function isStripeConfigured(): Promise<boolean> {
  return (await getStripeKey()) !== null;
}

async function stripeGet<T>(key: string, path: string, params?: Record<string, string | number>): Promise<T> {
  const qs = params
    ? "?" + Object.entries(params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join("&")
    : "";
  const res = await fetch(`${STRIPE_API}/${path}${qs}`, {
    headers: { Authorization: `Bearer ${key}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Stripe ${path} HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export type StripeBalanceAmount = { currency: string; amount: number }; // amount dalam sen
export type StripeBalance = { available: StripeBalanceAmount[]; pending: StripeBalanceAmount[] };

export async function fetchStripeBalance(): Promise<StripeBalance | null> {
  const key = await getStripeKey();
  if (!key) return null;
  const b = await stripeGet<{ available: StripeBalanceAmount[]; pending: StripeBalanceAmount[] }>(key, "balance");
  return { available: b.available || [], pending: b.pending || [] };
}

export type StripePayout = {
  id: string;
  amount: number; // sen
  currency: string;
  status: string; // paid | pending | in_transit | ...
  arrivalDate: number; // epoch s
};

// Payout yang tiba dalam julat tarikh (ikut arrival_date).
export async function fetchStripePayouts(opts: { from?: Date; to?: Date; limit?: number } = {}): Promise<StripePayout[]> {
  const key = await getStripeKey();
  if (!key) return [];
  const params: Record<string, string | number> = { limit: opts.limit ?? 50 };
  if (opts.from) params["arrival_date[gte]"] = Math.floor(opts.from.getTime() / 1000);
  if (opts.to) params["arrival_date[lte]"] = Math.floor(opts.to.getTime() / 1000);
  const r = await stripeGet<{ data: { id: string; amount: number; currency: string; status: string; arrival_date: number }[] }>(
    key,
    "payouts",
    params
  );
  return (r.data || []).map((p) => ({
    id: p.id,
    amount: p.amount,
    currency: p.currency.toUpperCase(),
    status: p.status,
    arrivalDate: p.arrival_date,
  }));
}

// Jumlah fees Stripe dalam julat tarikh (dari balance_transactions, ikut created).
export async function fetchStripeFees(opts: { from: Date; to: Date }): Promise<{ currency: string; fee: number; count: number }[]> {
  const key = await getStripeKey();
  if (!key) return [];
  const byCur = new Map<string, { fee: number; count: number }>();
  let startingAfter: string | undefined;
  for (let page = 0; page < 20; page++) {
    const params: Record<string, string | number> = {
      limit: 100,
      "created[gte]": Math.floor(opts.from.getTime() / 1000),
      "created[lte]": Math.floor(opts.to.getTime() / 1000),
    };
    if (startingAfter) params["starting_after"] = startingAfter;
    const r = await stripeGet<{ data: { id: string; currency: string; fee: number }[]; has_more: boolean }>(
      key,
      "balance_transactions",
      params
    );
    for (const t of r.data || []) {
      const cur = t.currency.toUpperCase();
      const acc = byCur.get(cur) || { fee: 0, count: 0 };
      acc.fee += t.fee || 0;
      if (t.fee) acc.count++;
      byCur.set(cur, acc);
    }
    if (!r.has_more || r.data.length === 0) break;
    startingAfter = r.data[r.data.length - 1].id;
  }
  return [...byCur.entries()].map(([currency, v]) => ({ currency, fee: v.fee, count: v.count }));
}
