import { createCipheriv, createDecipheriv, createHmac, randomBytes, createHash } from "node:crypto";

/**
 * AES-256-GCM encryption for sensitive fields (Pluggy item ids, account numbers,
 * notes, AI conversation). Format: base64(iv[12] | tag[16] | ciphertext).
 */
function key(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw && /^[0-9a-f]{64}$/i.test(raw)) return Buffer.from(raw, "hex");
  // Fallback derived from the auth secret so dev never breaks; set ENCRYPTION_KEY in production.
  return createHash("sha256")
    .update(`guioff:${process.env.BETTER_AUTH_SECRET ?? "dev"}`)
    .digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

export function encryptOptional(v?: string | null) {
  return v ? encrypt(v) : null;
}

export function decryptOptional(v?: string | null) {
  if (!v) return null;
  try {
    return decrypt(v);
  } catch {
    return null;
  }
}

/** Deterministic keyed hash, used to look records up without storing the plain value. */
export function hmac(value: string): string {
  return createHmac("sha256", key()).update(value).digest("hex");
}
