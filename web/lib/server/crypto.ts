import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM for one thing only: an Angel One session, at rest, for the
 * watchdog cron to use without a browser tab open.
 *
 * Deliberately not tagged `server-only` — unlike `lib/supabase.ts`, this file
 * touches no service-role key and no network; it is pure transform, and the
 * only way a test can hold it to its own round trip. `node:crypto` does not
 * exist in a browser bundle regardless, which is the real backstop against it
 * ending up in one.
 */

const ALGO = "aes-256-gcm";
const IV_BYTES = 12;

function key(): Buffer {
  const raw = process.env.DK_SESSION_ENC_KEY ?? "";
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      "DK_SESSION_ENC_KEY must be a base64-encoded 32-byte key (e.g. `openssl rand -base64 32`).",
    );
  }
  return buf;
}

/** Whether a usable key is configured — read fresh, not cached at import time. */
export function encryptionConfigured(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(enc: EncryptedSecret): string {
  const decipher = createDecipheriv(ALGO, key(), Buffer.from(enc.iv, "base64"));
  decipher.setAuthTag(Buffer.from(enc.tag, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(enc.ciphertext, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
