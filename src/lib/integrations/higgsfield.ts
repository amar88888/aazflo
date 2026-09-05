// Integrasi Higgsfield — jana video AI dari gambar produk (image-to-video).
// Kredential: HIGGSFIELD_CREDENTIALS = "KEY_ID:KEY_SECRET" (dari cloud.higgsfield.ai).
import { higgsfield, config } from "@higgsfield/client/v2";

export type HiggsfieldModel = "dop-lite" | "dop-turbo" | "dop-standard";

export function getHiggsfieldCreds(): string | null {
  const c = process.env.HIGGSFIELD_CREDENTIALS?.trim();
  return c && c.includes(":") ? c : null;
}

export function isHiggsfieldReady(): boolean {
  return getHiggsfieldCreds() !== null;
}

// Jana video dari gambar + prompt. Blok sampai siap (withPolling).
// Pulang URL video bila selesai; throw kalau gagal.
export async function generateProductVideo(opts: {
  prompt: string;
  imageUrl: string;
  model?: HiggsfieldModel;
}): Promise<string> {
  const creds = getHiggsfieldCreds();
  if (!creds) throw new Error("Higgsfield belum di-setup. Isi HIGGSFIELD_CREDENTIALS.");

  config({ credentials: creds });

  const res = await higgsfield.subscribe("/v1/image2video/dop", {
    input: {
      model: opts.model ?? "dop-turbo",
      prompt: opts.prompt,
      input_images: [{ type: "image_url", image_url: opts.imageUrl }],
      enhance_prompt: true,
    },
    withPolling: true,
  });

  if (res.status !== "completed" || !res.video?.url) {
    throw new Error(`Penjanaan video gagal (status: ${res.status}).`);
  }
  return res.video.url;
}
