import "server-only";

import { nextMidnightIst } from "@/lib/engine/config";
import {
  deleteBrokerSession,
  readBrokerSession,
  writeBrokerSession,
} from "@/lib/supabase";
import { decryptSecret, encryptSecret, encryptionConfigured } from "./crypto";

/**
 * Angel One session storage for background jobs — the risk watchdog reading
 * prices or managing positions with no browser tab open.
 *
 * Nothing here changes what the *browser* session does: the httpOnly cookie
 * remains the only thing page JavaScript can act through. This is a second,
 * independent copy of the same token, written wherever the cookie already is
 * (login, session-refresh), encrypted at rest, readable only by server code
 * holding `DK_SESSION_ENC_KEY`. Without that env var set, every function here
 * is a no-op — the watchdog feature is off by construction, not by a flag
 * someone has to remember to check.
 */

/** Best-effort store — a watchdog bookkeeping failure must never fail the sign-in it rode in on. */
export async function rememberBrokerSession(params: {
  clientCode: string;
  jwtToken: string;
  refreshToken?: string | null;
  at?: Date;
}): Promise<void> {
  if (!encryptionConfigured() || !params.clientCode || !params.jwtToken) return;
  try {
    const jwt = encryptSecret(params.jwtToken);
    const refresh = params.refreshToken ? encryptSecret(params.refreshToken) : null;
    await writeBrokerSession({
      client_code: params.clientCode,
      jwt_ciphertext: jwt.ciphertext,
      jwt_iv: jwt.iv,
      jwt_tag: jwt.tag,
      refresh_ciphertext: refresh?.ciphertext ?? null,
      refresh_iv: refresh?.iv ?? null,
      refresh_tag: refresh?.tag ?? null,
      expires_at: nextMidnightIst(params.at).toISOString(),
    });
  } catch {
    /* best-effort */
  }
}

/** Invalidate a stored session — on logout, so a signed-out account leaves nothing behind to decrypt. */
export async function forgetBrokerSession(clientCode: string): Promise<void> {
  if (!clientCode) return;
  await deleteBrokerSession(clientCode).catch(() => undefined);
}

export interface DecryptedBrokerSession {
  clientCode: string;
  jwtToken: string;
  refreshToken: string | null;
}

/**
 * The decrypted session for one account, or null if none is stored, expired,
 * or `DK_SESSION_ENC_KEY` is not configured.
 *
 * Expiry is judged locally against `expires_at` (set to the next midnight IST
 * at write time) rather than by calling the broker first — a caller about to
 * use this token will find out immediately if Angel One disagrees, and that
 * round trip should not be spent twice.
 */
export async function loadBrokerSession(
  clientCode: string,
): Promise<DecryptedBrokerSession | null> {
  if (!encryptionConfigured() || !clientCode) return null;

  const row = await readBrokerSession(clientCode).catch(() => null);
  if (!row) return null;
  if (new Date(row.expires_at).getTime() <= Date.now()) return null;

  try {
    const jwtToken = decryptSecret({
      ciphertext: row.jwt_ciphertext,
      iv: row.jwt_iv,
      tag: row.jwt_tag,
    });
    const refreshToken =
      row.refresh_ciphertext && row.refresh_iv && row.refresh_tag
        ? decryptSecret({
            ciphertext: row.refresh_ciphertext,
            iv: row.refresh_iv,
            tag: row.refresh_tag,
          })
        : null;
    return { clientCode: row.client_code, jwtToken, refreshToken };
  } catch {
    // Ciphertext the current key cannot open (a rotated DK_SESSION_ENC_KEY) is
    // the same as no session — there is nothing this account can do about it
    // but sign in again, which overwrites the row.
    return null;
  }
}
