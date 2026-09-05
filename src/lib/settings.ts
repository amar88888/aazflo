import { db } from "@/lib/db";
import { PLATFORMS, type Platform } from "@/lib/constants";

// Fee default kalau belum diset (peratus daripada harga jual).
const DEFAULT_FEES: Record<Platform, number> = {
  tiktok: 8,
  shopee: 10,
  woocommerce: 0,
};

export async function getSetting(key: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key } });
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.setting.upsert({ where: { key }, update: { value }, create: { key, value } });
}

// Fee % setiap platform (fee_tiktok, fee_shopee, fee_woo).
export async function getPlatformFees(): Promise<Record<Platform, number>> {
  const rows = await db.setting.findMany({
    where: { key: { in: ["fee_tiktok", "fee_shopee", "fee_woo"] } },
  });
  const map = new Map(rows.map((r) => [r.key, parseFloat(r.value)]));
  const fees = {} as Record<Platform, number>;
  for (const p of PLATFORMS) {
    const key = p === "woocommerce" ? "fee_woo" : `fee_${p}`;
    const v = map.get(key);
    fees[p] = v != null && !isNaN(v) ? v : DEFAULT_FEES[p];
  }
  return fees;
}
