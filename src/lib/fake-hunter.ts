import { db } from "@/lib/db";
import seed from "./fake-hunter-seed.json";

// 🕵️ FAKE HUNTER — senarai listing palsu / tanpa izin yang guna nama EVIOR, Facelim, Maxlim.
// Disimpan dalam Setting (key-value JSON) — tiada migration DB diperlukan.
// Sumber data: imbasan manual Claude dari Chrome Amar (Shopee/Lazada/TikTok) + borang "Tambah" di page.

export const FAKE_KEY = "fake_hunter_v1";

export * from "./fake-hunter-shared";
import { newId, guessPlatform, FAKE_STATUSES, type FakeListing } from "./fake-hunter-shared";

export async function getFakes(): Promise<FakeListing[]> {
  const row = await db.setting.findUnique({ where: { key: FAKE_KEY } });
  if (!row) return seed as FakeListing[];
  try {
    return JSON.parse(row.value) as FakeListing[];
  } catch {
    return seed as FakeListing[];
  }
}

export async function saveFakes(list: FakeListing[]): Promise<void> {
  const value = JSON.stringify(list);
  await db.setting.upsert({ where: { key: FAKE_KEY }, update: { value }, create: { key: FAKE_KEY, value } });
}

// Tambah / kemas kini ikut URL (status & nota sedia ada dikekalkan).
export async function upsertFakes(items: Partial<FakeListing>[]): Promise<{ added: number; updated: number }> {
  const list = await getFakes();
  const byUrl = new Map(list.map((l) => [l.url, l]));
  const now = new Date().toISOString();
  let added = 0;
  let updated = 0;
  for (const it of items) {
    if (!it.url) continue;
    const ex = byUrl.get(it.url);
    if (ex) {
      Object.assign(ex, {
        title: it.title ?? ex.title,
        price: it.price ?? ex.price,
        sold: it.sold ?? ex.sold,
        location: it.location ?? ex.location,
        shop: it.shop ?? ex.shop,
        // Imbasan harian boleh kemas kini status (dah_adu / dibuang) & nota.
        status: it.status && FAKE_STATUSES.includes(it.status) ? it.status : ex.status,
        note: it.note ?? ex.note,
        updatedAt: now,
      });
      updated++;
    } else {
      const n: FakeListing = {
        id: newId(it.url),
        platform: it.platform ?? guessPlatform(it.url),
        shop: it.shop ?? "",
        shopId: it.shopId ?? "",
        title: it.title ?? it.url,
        price: it.price ?? null,
        sold: it.sold ?? null,
        location: it.location ?? "",
        url: it.url,
        risk: it.risk ?? "SEMAK",
        reason: it.reason ?? "",
        status: it.status && FAKE_STATUSES.includes(it.status) ? it.status : "disyaki",
        note: it.note ?? "",
        foundAt: now,
        updatedAt: now,
      };
      list.unshift(n);
      byUrl.set(n.url, n);
      added++;
    }
  }
  await saveFakes(list);
  return { added, updated };
}

