"use server";

import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { addHours } from "date-fns";

export async function addRecordingAction(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) return;
  await db.recording.create({
    data: {
      title,
      fileRef: String(formData.get("fileRef") ?? "").trim() || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  revalidatePath("/live");
}

export async function addSlotAction(formData: FormData) {
  const startRaw = formData.get("startAt");
  if (!startRaw) return;
  const startAt = new Date(String(startRaw));
  if (isNaN(startAt.getTime())) return;
  const recordingId = String(formData.get("recordingId") ?? "") || null;

  await db.liveSlot.create({
    data: {
      startAt,
      endAt: addHours(startAt, 3), // 1 slot = 3 jam
      recordingId,
    },
  });
  revalidatePath("/live");
}

export async function logSlotResultAction(formData: FormData) {
  const id = String(formData.get("slotId") ?? "");
  if (!id) return;
  const salesTotal = parseFloat(String(formData.get("salesTotal") ?? ""));
  const peakViewers = parseInt(String(formData.get("peakViewers") ?? ""), 10);

  await db.liveSlot.update({
    where: { id },
    data: {
      salesTotal: isNaN(salesTotal) ? null : salesTotal,
      peakViewers: isNaN(peakViewers) ? null : peakViewers,
      notes: String(formData.get("notes") ?? "").trim() || null,
    },
  });
  revalidatePath("/live");
}

export async function deleteSlotAction(id: string) {
  await db.liveSlot.delete({ where: { id } });
  revalidatePath("/live");
}
