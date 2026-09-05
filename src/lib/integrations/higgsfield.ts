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

  // API terkini nak input dibungkus dalam `params`. SDK 0.2.1 spread {...input}
  // terus, jadi kita letak params di aras input supaya body = { params: {...} }.
  const res = await higgsfield.subscribe("/v1/image2video/dop", {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    input: {
      params: {
        model: opts.model ?? "dop-turbo",
        prompt: opts.prompt,
        input_images: [{ type: "image_url", image_url: opts.imageUrl }],
        enhance_prompt: true,
      },
    } as unknown as Record<string, unknown>,
    withPolling: true,
  });

  // Cari URL video dalam beberapa kemungkinan bentuk respons.
  const r = res as unknown as {
    status?: string;
    video?: { url?: string };
    results?: { raw?: { url?: string } };
    jobs?: Array<{ results?: { raw?: { url?: string } } }>;
  };
  const url =
    r.video?.url || r.results?.raw?.url || r.jobs?.[0]?.results?.raw?.url || null;
  if (!url) {
    throw new Error(`Penjanaan video gagal (status: ${r.status ?? "?"}).`);
  }
  return url;
}
