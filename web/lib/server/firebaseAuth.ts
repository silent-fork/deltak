import "server-only";

import { cookies } from "next/headers";
import type { NextResponse } from "next/server";

import { RateLimiter } from "./rateLimiter";

/**
 * Firebase Identity Toolkit — email/password auth for `/discuss`, called by
 * REST rather than the `firebase` client SDK (see `.env.example`'s Discuss
 * section for why). This is a wholly separate identity from the Angel One
 * SmartAPI session the Terminal uses: a forum account is not a broker
 * account, and requiring one to post here would be absurd.
 *
 * No Google, no passwordless magic link — email + password only, by explicit
 * choice: fewer moving parts than wiring an OAuth consent screen, and no
 * outbound email to configure/deliver for a link.
 */

const IDENTITY_ROOT = "https://identitytoolkit.googleapis.com/v1";
const SECURE_TOKEN_ROOT = "https://securetoken.googleapis.com/v1";

const API_KEY = process.env.FIREBASE_API_KEY ?? "";

export class FirebaseAuthError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "FirebaseAuthError";
  }
}

/**
 * Every Identity Toolkit / Secure Token error body shares this shape:
 * `{ error: { code, message, errors: [...] } }`, with `message` a short
 * constant like "EMAIL_EXISTS" or "INVALID_LOGIN_CREDENTIALS" rather than
 * prose — the caller maps these to what an operator actually reads.
 */
async function call<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const code = payload?.error?.message ?? "UNKNOWN_ERROR";
    throw new FirebaseAuthError(code, res.status, code);
  }
  return payload as T;
}

export interface FirebaseAuthResult {
  idToken: string;
  refreshToken: string;
  localId: string;
  email: string;
  /** Seconds, per Identity Toolkit's own field name. */
  expiresIn: string;
}

export function signUp(email: string, password: string): Promise<FirebaseAuthResult> {
  return call<FirebaseAuthResult>(
    `${IDENTITY_ROOT}/accounts:signUp?key=${API_KEY}`,
    { email, password, returnSecureToken: true },
  );
}

export function signIn(email: string, password: string): Promise<FirebaseAuthResult> {
  return call<FirebaseAuthResult>(
    `${IDENTITY_ROOT}/accounts:signInWithPassword?key=${API_KEY}`,
    { email, password, returnSecureToken: true },
  );
}

export interface RefreshResult {
  id_token: string;
  refresh_token: string;
  expires_in: string;
  user_id: string;
}

/** The refreshed pair uses snake_case field names — a different endpoint family from Identity Toolkit's own camelCase. */
export function refreshIdToken(refreshToken: string): Promise<RefreshResult> {
  return call<RefreshResult>(`${SECURE_TOKEN_ROOT}/token?key=${API_KEY}`, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
}

/**
 * Signup and login share one budget per IP-agnostic global limiter — this
 * process has no per-IP tracking, and Firebase's own abuse protection is the
 * real backstop. This is just enough to stop a runaway retry loop in this
 * app's own code from hammering Identity Toolkit.
 */
const authLimiter = new RateLimiter([{ ms: 1_000, max: 5 }]);

export async function rateLimitedSignUp(
  email: string,
  password: string,
): Promise<FirebaseAuthResult> {
  await authLimiter.acquire();
  return signUp(email, password);
}

export async function rateLimitedSignIn(
  email: string,
  password: string,
): Promise<FirebaseAuthResult> {
  await authLimiter.acquire();
  return signIn(email, password);
}

/* ----------------------------------------------------------- session cookie */

export const FORUM_SESSION_COOKIE = "dk_forum_session";

export interface ForumSession {
  uid: string;
  email: string;
  idToken: string;
  refreshToken: string;
  /** Epoch ms — `idToken` is only good for an hour; past this, refresh before using it. */
  idTokenExpiresAt: number;
}

export const FORUM_SESSION_MAX_AGE = 60 * 60 * 24 * 30;

export const FORUM_SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: FORUM_SESSION_MAX_AGE,
} as const;

export function encodeForumSession(s: ForumSession): string {
  return Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
}

export function decodeForumSession(raw: string | undefined): ForumSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed?.uid === "string" && typeof parsed?.idToken === "string") {
      return parsed as ForumSession;
    }
  } catch {
    /* malformed cookie — treat as signed out */
  }
  return null;
}

/**
 * `{ uid, email } | null` for a Server Component that only needs to know
 * *who's* viewing to render the right chrome (a "Sign in" link vs. a
 * display name) — no network call, no token refresh, since rendering a byline
 * doesn't need a bearer token good enough to write with the way an actual
 * `/api/discuss/*` POST does (that path is `getActiveForumSession` instead).
 */
export async function getViewerIdentity(): Promise<{ uid: string; email: string } | null> {
  const raw = (await cookies()).get(FORUM_SESSION_COOKIE)?.value;
  const session = decodeForumSession(raw);
  return session ? { uid: session.uid, email: session.email } : null;
}

/**
 * A valid ID token for the given session, refreshing first if it's within a
 * minute of expiry — Firestore's REST API rejects an expired bearer token
 * outright, and a page view is a bad place to first discover that. Returns
 * both the token to use *and* (when it refreshed) the new session to
 * re-encode into the cookie, since the caller owns the response object this
 * function doesn't have access to.
 */
export async function freshIdToken(
  session: ForumSession,
): Promise<{ idToken: string; refreshed: ForumSession | null }> {
  if (Date.now() < session.idTokenExpiresAt - 60_000) {
    return { idToken: session.idToken, refreshed: null };
  }
  const res = await refreshIdToken(session.refreshToken);
  const refreshed: ForumSession = {
    ...session,
    idToken: res.id_token,
    refreshToken: res.refresh_token,
    idTokenExpiresAt: Date.now() + Number(res.expires_in) * 1000,
  };
  return { idToken: refreshed.idToken, refreshed };
}

export interface ActiveForumSession {
  uid: string;
  idToken: string;
  /** Re-encoded cookie value to set on the response — only present when the ID token needed refreshing. */
  refreshedCookie: string | null;
}

/**
 * The one call every write route under `/api/discuss/*` (other than
 * auth itself) makes first: read the cookie, refresh if needed, hand back a
 * token good enough to write with. Null means "not signed in" — the route
 * itself decides what a 401 says, this just answers whether there is one.
 */
export async function getActiveForumSession(): Promise<ActiveForumSession | null> {
  const raw = (await cookies()).get(FORUM_SESSION_COOKIE)?.value;
  const session = decodeForumSession(raw);
  if (!session) return null;
  try {
    const { idToken, refreshed } = await freshIdToken(session);
    return {
      uid: session.uid,
      idToken,
      refreshedCookie: refreshed ? encodeForumSession(refreshed) : null,
    };
  } catch {
    return null;
  }
}

/** Every write route ends with this — re-stamp the cookie only if the token actually needed refreshing this request. */
export function applyRefreshedCookie(res: NextResponse, session: ActiveForumSession): NextResponse {
  if (session.refreshedCookie) {
    res.cookies.set(FORUM_SESSION_COOKIE, session.refreshedCookie, FORUM_SESSION_COOKIE_OPTIONS);
  }
  return res;
}
