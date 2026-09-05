// Integrasi Higgsfield — jana video AI dari gambar produk (image-to-video).
// Kredential: "KEY_ID:KEY_SECRET" (dari cloud.higgsfield.ai).
// Sumber: DB (ApiCredential 'higgsfield', encrypted) ATAU env HIGGSFIELD_CREDENTIALS.
import { higgsfield, config } from "@higgsfield/client/v2";
import { loadCredentials } from "@/lib/credentials";

export type HiggsfieldModel = "dop-lite" | "dop-turbo" | "dop-standard";
export type HiggsfieldCreds = { credentials: string };

export async function getHiggsfieldCreds(): Promise<string | null> {
  const fromDb = await loadCredentials<HiggsfieldCreds>("higgsfield");
  const c = (fromDb?.credentials || process.env.HIGGSFIELD_CREDENTIALS || "").trim();
  return c && c.includes(":") ? c : null;
}

export async function isHiggsfieldReady(): Promise<boolean> {
  return (await getHiggsfieldCreds()) !== null;
}

// Jana video dari gambar + prompt. Blok sampai siap (withPolling).
export async function generateProductVideo(opts: {
  prompt: string;
  imageUrl: string;
  model?: HiggsfieldModel;
}): Promise<string> {
  const creds = await getHiggsfieldCreds();
  if (!creds) throw new Error("Higgsfield belum di-setup.");

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
