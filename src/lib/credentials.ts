import { db } from "@/lib/db";
import { encrypt, decrypt } from "@/lib/crypto";

// Simpan/baca token per platform dalam jadual ApiCredential (data = JSON encrypted).

export type TikTokCreds = {
  accessToken: string;
  refreshToken: string;
  accessExpireAt: number; // epoch ms
  shopCipher?: string;
  shopId?: string;
};

export type ShopeeCreds = {
  shopId: string;
  accessToken: string;
  refreshToken: string;
  accessExpireAt: number; // epoch ms
};

export async function saveCredentials(platform: string, creds: unknown): Promise<void> {
  const data = encrypt(JSON.stringify(creds));
  await db.apiCredential.upsert({
    where: { platform },
    update: { data },
    create: { platform, data },
  });
}

export async function loadCredentials<T>(platform: string): Promise<T | null> {
  const row = await db.apiCredential.findUnique({ where: { platform } });
  if (!row) return null;
  try {
    return JSON.parse(decrypt(row.data)) as T;
  } catch {
    return null;
  }
}
