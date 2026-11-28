"use server";

import { revalidatePath } from "next/cache";
import { getFakes, saveFakes, upsertFakes, guessPlatform, FAKE_STATUSES, type FakeStatus } from "@/lib/fake-hunter";

export async function setFakeStatusAction(id: string, status: string, note?: string) {
  if (!FAKE_STATUSES.includes(status as FakeStatus)) return;
  const list = await getFakes();
  const it = list.find((l) => l.id === id);
  if (!it) return;
  it.status = status as FakeStatus;
  if (note !== undefined) it.note = note;
  it.updatedAt = new Date().toISOString();
  await saveFakes(list);
  revalidatePath("/fakes");
}

export async function addFakeAction(formData: FormData): Promise<{ ok: boolean; message: string }> {
  const url = String(formData.get("url") ?? "").trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, message: "Tampal link penuh (bermula https://)." };
  const shop = String(formData.get("shop") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const r = await upsertFakes([
    { url, shop: shop || undefined, title: shop ? `Listing ${shop}` : undefined, platform: guessPlatform(url), risk: "SEMAK", reason: "ditambah manual", note },
  ]);
  revalidatePath("/fakes");
  return { ok: true, message: r.added ? "Ditambah ✅" : "Link dah ada dalam senarai." };
}

export async function deleteFakeAction(id: string) {
  const list = await getFakes();
  await saveFakes(list.filter((l) => l.id !== id));
  revalidatePath("/fakes");
}
