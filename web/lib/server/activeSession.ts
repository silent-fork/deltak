import "server-only";

import { randomUUID } from "node:crypto";

import { deleteClientSession, readClientSessionId, writeClientSession } from "@/lib/supabase";

/**
 * Single-active-session enforcement, independent of Angel One's own JWT.
 *
 * Angel One hands out a fresh, valid JWT on every `loginByPassword` call
 * without revoking whichever one it issued last, so two browser windows
 * signed in as the same client code both keep working until their cookies
 * separately expire — this is what closes that gap. `client_sessions` holds
 * one session id per account; a login overwrites it, and any window still
 * carrying the previous id fails the next `isActiveSession` check.
 *
 * Fails open, deliberately: without `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`
 * configured there is nowhere to record a session id, so every session is
 * trivially "active" — same degrade path persistence already takes. A stored
 * row that simply doesn't match is the only thing that signs a session out.
 */

/** Mint and record a new session id for this login — what makes any previous one stale. */
export async function claimActiveSession(clientCode: string): Promise<string> {
  const sessionId = randomUUID();
  await writeClientSession(clientCode, sessionId).catch(() => undefined);
  return sessionId;
}

/**
 * Whether `sessionId` is still the one on file for `clientCode`.
 *
 * A missing `sessionId` (a cookie from before this feature existed) or an
 * unreadable table both fail open — there is nothing on file to contradict
 * the caller. Only a stored id that disagrees counts as superseded.
 */
export async function isActiveSession(
  clientCode: string,
  sessionId: string | undefined,
): Promise<boolean> {
  if (!sessionId) return true;
  const onFile = await readClientSessionId(clientCode).catch(() => null);
  if (!onFile) return true;
  return onFile === sessionId;
}

/** Called on explicit sign-out, so a stale row can't outlive the account that owned it. */
export async function forgetActiveSession(clientCode: string): Promise<void> {
  if (!clientCode) return;
  await deleteClientSession(clientCode).catch(() => undefined);
}
