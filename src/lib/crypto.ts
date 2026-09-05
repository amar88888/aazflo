import crypto from "crypto";

// AES-256-GCM untuk simpan token API dalam DB (ApiCredential.data).
// Kunci dari APP_ENCRYPTION_KEY (hex 32 bytes: `openssl rand -hex 32`).
// Fallback ke NEXTAUTH_SECRET semasa dev supaya tak crash bila belum set.

function getKey(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET || "";
  if (!raw) throw new Error("APP_ENCRYPTION_KEY tidak diset");
  // Terima hex 64-char (32 bytes) terus; kalau tidak, derive guna sha256
  if (/^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  return crypto.createHash("sha256").update(raw).digest();
}

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: iv.tag.ciphertext (semua base64)
  return `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
}

export function decrypt(payload: string): string {
  const [ivB64, tagB64, dataB64] = payload.split(".");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Format cipher tidak sah");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
