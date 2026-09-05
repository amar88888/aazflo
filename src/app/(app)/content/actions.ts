"use server";

import { generateProductVideo, type HiggsfieldModel } from "@/lib/integrations/higgsfield";
import { sendTelegram } from "@/lib/telegram";

export type GenState = { ok: boolean; message: string; videoUrl?: string } | null;

const MODELS: HiggsfieldModel[] = ["dop-lite", "dop-turbo", "dop-standard"];

export async function generateVideoAction(_prev: GenState, formData: FormData): Promise<GenState> {
  const imageUrl = String(formData.get("imageUrl") ?? "").trim();
  const prompt = String(formData.get("prompt") ?? "").trim();
  const productName = String(formData.get("productName") ?? "").trim();
  const modelRaw = String(formData.get("model") ?? "dop-turbo").trim();
  const model = (MODELS.includes(modelRaw as HiggsfieldModel) ? modelRaw : "dop-turbo") as HiggsfieldModel;

  if (!imageUrl || !/^https?:\/\//.test(imageUrl)) {
    return { ok: false, message: "Sila masukkan URL gambar produk yang sah (https://...)." };
  }
  if (!prompt) {
    return { ok: false, message: "Sila masukkan prompt (huraian video)." };
  }

  try {
    const videoUrl = await generateProductVideo({ prompt, imageUrl, model });

    // Hantar ke Telegram (best-effort — kalau bot dah di-setup).
    const caption =
      `🎬 <b>Video AI siap!</b>\n` +
      (productName ? `Produk: <b>${productName}</b>\n` : "") +
      `Prompt: ${prompt}\n\n` +
      `<a href="${videoUrl}">▶️ Tonton / Muat turun video</a>\n\n` +
      `<i>Nota: link Higgsfield sah ~7 hari. Simpan video kalau perlu.</i>`;
    await sendTelegram(caption).catch(() => {});

    return { ok: true, message: "Video berjaya dijana!", videoUrl };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Penjanaan gagal." };
  }
}
