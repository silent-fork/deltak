import "server-only";

import { withRetry } from "@/lib/retry";
import { RateLimiter } from "./rateLimiter";
import {
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SESSION_MAX_AGE,
  decodeSession,
  encodeSession,
  type ServerSession,
} from "./session";

// Re-exported so every existing `@/lib/server/smartapi` import keeps working
// now that the cookie envelope lives in `./session`, shared with Dhan.
export { SESSION_COOKIE, SESSION_COOKIE_OPTIONS, SESSION_MAX_AGE, decodeSession, encodeSession };
export type { ServerSession };

/**
 * Angel One SmartAPI v2.0 client for route handlers.
 *
 * Serverless functions are stateless, so there is no long-lived session object
 * here as there was in the Python engine. Instead:
 *
 *  - `DK_API_KEY` lives in the server environment and never leaves it for REST
 *    calls (it is separately exposed to the browser for the market-data
 *    WebSocket — see the login route for why, and what that does and does not
 *    grant).
 *  - The `jwtToken` — the credential that can place orders — is returned to the
 *    caller only inside an httpOnly cookie, so page JavaScript cannot read it.
 */

const API_ROOT = "https://apiconnect.angelone.in";
export const LOGIN_URL = `${API_ROOT}/rest/auth/angelbroking/user/v1/loginByPassword`;
export const REFRESH_URL = `${API_ROOT}/rest/auth/angelbroking/jwt/v1/generateTokens`;
export const PROFILE_URL = `${API_ROOT}/rest/secure/angelbroking/user/v1/getProfile`;
export const LOGOUT_URL = `${API_ROOT}/rest/secure/angelbroking/user/v1/logout`;
export const RMS_URL = `${API_ROOT}/rest/secure/angelbroking/user/v1/getRMS`;
export const PLACE_ORDER_URL = `${API_ROOT}/rest/secure/angelbroking/order/v1/placeOrder`;
export const LTP_URL = `${API_ROOT}/rest/secure/angelbroking/order/v1/getLtpData`;
export const CANDLE_URL = `${API_ROOT}/rest/secure/angelbroking/historical/v1/getCandleData`;
export const OI_DATA_URL = `${API_ROOT}/rest/secure/angelbroking/historical/v1/getOIData`;
export const PCR_URL = `${API_ROOT}/rest/secure/angelbroking/marketData/v1/putCallRatio`;
export const OI_BUILDUP_URL = `${API_ROOT}/rest/secure/angelbroking/marketData/v1/OIBuildup`;
export const MARGIN_BATCH_URL = `${API_ROOT}/rest/secure/angelbroking/margin/v1/batch`;

export const API_KEY = process.env.DK_API_KEY ?? "";
export const CLIENT_LOCAL_IP = process.env.DK_CLIENT_LOCAL_IP ?? "127.0.0.1";
export const CLIENT_PUBLIC_IP = process.env.DK_CLIENT_PUBLIC_IP ?? "127.0.0.1";
export const MAC_ADDRESS = process.env.DK_MAC_ADDRESS ?? "00:00:00:00:00:00";

/**
 * Angel One's own published throttling, per endpoint — request/second,
 * request/minute, request/hour where documented. `getOIData`,
 * `putCallRatio` and `OIBuildup` aren't in Angel One's published table; 1/sec
 * is a deliberately conservative default for them, not a documented number.
 *
 * Every call to a given endpoint shares one budget here regardless of which
 * browser tab or operator triggered it — see `rateLimiter.ts` for why that
 * has to live here rather than in the browser's own request queue.
 */
const limiters: Record<string, RateLimiter> = {
  [CANDLE_URL]: new RateLimiter([
    { ms: 1_000, max: 3 },
    { ms: 60_000, max: 150 },
    { ms: 3_600_000, max: 5_000 },
  ]),
  [OI_DATA_URL]: new RateLimiter([{ ms: 1_000, max: 1 }]),
  [PCR_URL]: new RateLimiter([{ ms: 1_000, max: 1 }]),
  [OI_BUILDUP_URL]: new RateLimiter([{ ms: 1_000, max: 1 }]),
  [MARGIN_BATCH_URL]: new RateLimiter([
    { ms: 1_000, max: 10 },
    { ms: 60_000, max: 500 },
    { ms: 3_600_000, max: 5_000 },
  ]),
};

export class SmartApiError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly code?: string,
  ) {
    super(message);
    this.name = "SmartApiError";
  }
}

export function smartApiHeaders(jwt?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-UserType": "USER",
    "X-SourceID": "WEB",
    "X-ClientLocalIP": CLIENT_LOCAL_IP,
    "X-ClientPublicIP": CLIENT_PUBLIC_IP,
    "X-MACAddress": MAC_ADDRESS,
    "X-PrivateKey": API_KEY,
  };
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  return headers;
}

/** Angel One's throttle reply — `AB1004`, or a message that names the rate. */
function isRateLimit(message?: string, errorcode?: string): boolean {
  if (errorcode === "AB1004") return true;
  return /exceeding access rate|rate limit/i.test(message ?? "");
}

/** Normalise Angel One's `{status, message, errorcode, data}` envelope. */
export async function smartApiCall<T = Record<string, unknown>>(
  url: string,
  init: { method: "GET" | "POST"; body?: unknown; jwt?: string },
): Promise<T> {
  if (!API_KEY) {
    throw new SmartApiError(
      "Server is not configured with a SmartAPI key. Set DK_API_KEY in the deployment's environment.",
      503,
    );
  }

  // Waits its turn against every other call this deployment is making to the
  // same endpoint, from any request — not just this one. An endpoint with no
  // configured limiter (order placement, login, profile — none of which this
  // module's callers hit today) proceeds unthrottled.
  await limiters[url]?.acquire();

  let res: Response;
  try {
    // One retry, short gap: a bare `fetch()` failure here is Vercel's own
    // network to Angel One hiccupping, not a rate limit or a rejection (both
    // are classified from a real response below and never reach this catch)
    // — most of these clear in under a second and never need to surface as
    // the 502 the browser console otherwise shows for every one of them.
    //
    // The 8s AbortSignal is load-bearing, not decorative: a bare `fetch()`
    // has no timeout of its own, so one slow Angel One response used to hang
    // until Vercel's own hard function ceiling killed the whole request —
    // fatal for `/api/market/batch`, where up to 25 of these run per call
    // and one straggler took the entire ladder down with it instead of
    // failing just its own contract.
    res = await withRetry(
      () =>
        fetch(url, {
          method: init.method,
          headers: smartApiHeaders(init.jwt),
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        }),
      2,
      300,
    );
  } catch (err) {
    throw new SmartApiError(
      `SmartAPI transport error: ${err instanceof Error ? err.message : "unreachable"}`,
    );
  }

  let payload: {
    status?: boolean;
    message?: string;
    errorcode?: string;
    data?: unknown;
  };
  try {
    payload = await res.json();
  } catch {
    throw new SmartApiError(`SmartAPI returned non-JSON (HTTP ${res.status})`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new SmartApiError(payload.message ?? "SmartAPI session expired", 401, payload.errorcode);
  }
  // Angel One meters the historical endpoints hard (a few requests a second per
  // key) and answers a breach with a 200 carrying an "exceeding access rate"
  // message. Surfacing that as 429 lets callers back off instead of treating a
  // throttle as a dead endpoint.
  if (res.status === 429 || isRateLimit(payload.message, payload.errorcode)) {
    throw new SmartApiError(
      payload.message ?? "SmartAPI rate limit exceeded",
      429,
      payload.errorcode,
    );
  }
  if (!payload.status) {
    throw new SmartApiError(
      payload.message ?? "SmartAPI request rejected",
      502,
      payload.errorcode,
    );
  }
  return (payload.data ?? {}) as T;
}

