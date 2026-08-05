import "server-only";

import type { Broker } from "@/lib/types";

/**
 * The browser-facing session cookie, shared across brokers.
 *
 * Each broker owns its own REST client and credential shapes
 * (`lib/server/smartapi.ts` for Angel One, `lib/server/dhan.ts` for Dhan);
 * this module owns only the cookie envelope both write to and read from, so
 * `/api/auth/*` can branch on `broker` without duplicating the
 * encode/decode/cookie-options plumbing per broker.
 */

export const SESSION_COOKIE = "dk_session";

export type { Broker };

interface AngelOneSession {
  broker: "angelone";
  jwtToken: string;
  refreshToken: string;
  /** Market-data token for the browser's own SmartStream socket. */
  feedToken?: string;
}

interface DhanSession {
  broker: "dhan";
  /**
   * Both the trading- and market-data-capable token. Dhan issues no separate
   * feed-scoped credential, so this reaches the browser the same way Angel
   * One's `feedToken` does today (the browser opens its own WebSocket) — a
   * real difference in what leaks, accepted for now, matching Angel One's
   * existing browser-direct-feed architecture rather than standing up a
   * relay.
   */
  accessToken: string;
  /** ISO — when the Dhan access token itself expires, per `generateAccessToken`. Not this cookie's own expiry. */
  tokenExpiresAt: string;
}

export type ServerSession = (AngelOneSession | DhanSession) & {
  clientCode: string;
  /** When the session was established, ISO to the second. */
  loginAt?: string;
  /**
   * This window's claim on `client_sessions` — the single-active-session
   * arbiter. Absent on a cookie written before that feature existed, which
   * `isActiveSession` treats as unverifiable rather than superseded.
   */
  sessionId?: string;
};

/**
 * How long the cookie may live.
 *
 * SmartAPI sessions expire daily and Dhan access tokens last 24h, so this is
 * a ceiling rather than a promise either way: the session route revalidates
 * (against the broker for Angel One, against the stored expiry for Dhan) and
 * rewrites or clears the cookie — that, not the age of the cookie, decides
 * whether the terminal is signed in.
 */
export const SESSION_MAX_AGE = 60 * 60 * 16;

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_MAX_AGE,
} as const;

export function encodeSession(s: ServerSession): string {
  return Buffer.from(JSON.stringify(s), "utf8").toString("base64url");
}

export function decodeSession(raw: string | undefined): ServerSession | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    if (typeof parsed?.clientCode !== "string") return null;
    if (parsed.broker === "dhan" && typeof parsed.accessToken === "string") {
      return parsed as ServerSession;
    }
    // Cookies written before `broker` existed are Angel One's own shape —
    // treated as broker: "angelone" rather than signed out.
    if (
      (parsed.broker === "angelone" || parsed.broker === undefined) &&
      typeof parsed.jwtToken === "string"
    ) {
      return { ...parsed, broker: "angelone" } as ServerSession;
    }
  } catch {
    /* malformed cookie — treat as signed out */
  }
  return null;
}
