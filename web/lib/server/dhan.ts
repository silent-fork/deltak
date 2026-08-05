import "server-only";

import { withRetry } from "@/lib/retry";
import { RateLimiter } from "./rateLimiter";

/**
 * DhanHQ v2 Data API client for route handlers.
 *
 * Mirrors the shape of `./smartapi.ts` deliberately — same call-through
 * pattern (one function per endpoint's URL, one shared error-normalising
 * caller, one rate limiter per endpoint) — so `/api/auth/*` and
 * `/api/market/*` can branch on `broker` without the two clients disagreeing
 * about what a call looks like.
 *
 * Unlike Angel One, Dhan's data-plane token *is* the trading-capable one —
 * there is no separate feed-scoped credential. `DHAN_CLIENT_ID`/the access
 * token generated at login are both server secrets for REST calls here, and
 * the access token is additionally returned to the browser so it can open
 * its own WebSocket, the same way Angel One's `feedToken` is today.
 */

const DATA_API_ROOT = "https://api.dhan.co/v2";
const AUTH_ROOT = "https://auth.dhan.co";

export const GENERATE_TOKEN_URL = `${AUTH_ROOT}/app/generateAccessToken`;

export const LTP_URL = `${DATA_API_ROOT}/marketfeed/ltp`;
export const OHLC_URL = `${DATA_API_ROOT}/marketfeed/ohlc`;
export const QUOTE_URL = `${DATA_API_ROOT}/marketfeed/quote`;
export const INTRADAY_URL = `${DATA_API_ROOT}/charts/intraday`;
export const HISTORICAL_URL = `${DATA_API_ROOT}/charts/historical`;
/** Strike-relative (ATM±N) history across expired contracts — not wired into a route yet. */
export const ROLLING_OPTION_URL = `${DATA_API_ROOT}/charts/rollingoption`;
export const OPTION_CHAIN_URL = `${DATA_API_ROOT}/optionchain`;
export const EXPIRY_LIST_URL = `${DATA_API_ROOT}/optionchain/expirylist`;
export const INSTRUMENT_MASTER_URL = "https://images.dhan.co/api-data/api-scrip-master-detailed.csv";

/**
 * Dhan's own published throttling (Annexure + the Live Market Feed/Option
 * Chain docs): Data APIs generally 5 req/sec, Option Chain 1 request per 3
 * seconds, Market Quote 1 req/sec (batched up to 1000 instruments/request).
 * Every call to a given endpoint shares one budget here regardless of which
 * browser tab or operator triggered it — same reasoning as Angel One's
 * limiter in `smartapi.ts`.
 */
const limiters: Record<string, RateLimiter> = {
  [QUOTE_URL]: new RateLimiter([{ ms: 1_000, max: 1 }]),
  [LTP_URL]: new RateLimiter([{ ms: 1_000, max: 1 }]),
  [OHLC_URL]: new RateLimiter([{ ms: 1_000, max: 1 }]),
  [INTRADAY_URL]: new RateLimiter([{ ms: 1_000, max: 3 }]),
  [HISTORICAL_URL]: new RateLimiter([{ ms: 1_000, max: 3 }]),
  [ROLLING_OPTION_URL]: new RateLimiter([{ ms: 1_000, max: 3 }]),
  [OPTION_CHAIN_URL]: new RateLimiter([{ ms: 3_000, max: 1 }]),
  [EXPIRY_LIST_URL]: new RateLimiter([{ ms: 3_000, max: 1 }]),
};

export class DhanApiError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly code?: string,
  ) {
    super(message);
    this.name = "DhanApiError";
  }
}

export function dhanHeaders(accessToken: string, clientId: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "access-token": accessToken,
    "client-id": clientId,
  };
}

/**
 * Dhan Trading/Data API error codes (Annexure) — collapsed to the same HTTP
 * statuses Angel One's caller uses, so a route handler's `catch` block does
 * not need to know which broker it was talking to.
 */
function statusForErrorCode(code: string | undefined): number {
  switch (code) {
    case "DH-901": // invalid/expired auth
    case "807": // access token expired
    case "808": // auth failed
    case "809": // access token invalid
    case "810": // client ID invalid
      return 401;
    case "DH-904": // rate limit
    case "805": // too many requests
      return 429;
    case "DH-905": // input exception
    case "811":
    case "812":
    case "813":
    case "814":
      return 400;
    default:
      return 502;
  }
}

/** Normalise Dhan's `{status, data}` success envelope and `{errorType, errorCode, errorMessage}` failure envelope. */
export async function dhanApiCall<T = Record<string, unknown>>(
  url: string,
  init: { method: "GET" | "POST"; body?: unknown; accessToken: string; clientId: string },
): Promise<T> {
  await limiters[url]?.acquire();

  let res: Response;
  try {
    // The 8s AbortSignal is load-bearing, not decorative — see smartApiCall's
    // own comment for why: a bare `fetch()` has no timeout of its own, and
    // `/api/market/batch` runs up to 25 of these per call. One slow Dhan
    // response used to hang the whole batch until Vercel's own 60s function
    // ceiling killed it, instead of failing just its own contract.
    res = await withRetry(
      () =>
        fetch(url, {
          method: init.method,
          headers: dhanHeaders(init.accessToken, init.clientId),
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        }),
      2,
      300,
    );
  } catch (err) {
    throw new DhanApiError(
      `Dhan transport error: ${err instanceof Error ? err.message : "unreachable"}`,
    );
  }

  let payload: {
    status?: string;
    data?: unknown;
    errorType?: string;
    errorCode?: string;
    errorMessage?: string;
  };
  try {
    payload = await res.json();
  } catch {
    throw new DhanApiError(`Dhan returned non-JSON (HTTP ${res.status})`);
  }

  if (payload.errorCode || payload.errorType) {
    throw new DhanApiError(
      payload.errorMessage ?? payload.errorType ?? "Dhan request rejected",
      statusForErrorCode(payload.errorCode),
      payload.errorCode,
    );
  }
  if (!res.ok) {
    throw new DhanApiError(`Dhan request failed (HTTP ${res.status})`, res.status);
  }
  return (payload.data ?? payload) as T;
}

/* --------------------------------------------------------------- TOTP login */

export interface GenerateTokenResult {
  dhanClientId: string;
  dhanClientName?: string;
  dhanClientUcc?: string;
  givenPowerOfAttorney?: boolean;
  accessToken: string;
  expiryTime: string;
}

/**
 * `POST auth.dhan.co/app/generateAccessToken` — client ID + PIN + TOTP,
 * mirroring Angel One's `loginByPassword` shape closely enough that the login
 * screen can offer both brokers behind one form. Query parameters, not a JSON
 * body — this endpoint lives outside the Data API's own request/response
 * envelope.
 */
export async function generateDhanAccessToken(params: {
  dhanClientId: string;
  pin: string;
  totp: string;
}): Promise<GenerateTokenResult> {
  const url = new URL(GENERATE_TOKEN_URL);
  url.searchParams.set("dhanClientId", params.dhanClientId);
  url.searchParams.set("pin", params.pin);
  url.searchParams.set("totp", params.totp);

  let res: Response;
  try {
    res = await withRetry(
      () => fetch(url.toString(), { method: "POST", headers: { Accept: "application/json" }, cache: "no-store" }),
      2,
      300,
    );
  } catch (err) {
    throw new DhanApiError(
      `Dhan auth transport error: ${err instanceof Error ? err.message : "unreachable"}`,
    );
  }

  let payload: (GenerateTokenResult & { errorType?: string; errorCode?: string; errorMessage?: string }) | null;
  try {
    payload = await res.json();
  } catch {
    throw new DhanApiError(`Dhan auth returned non-JSON (HTTP ${res.status})`);
  }

  if (!payload || payload.errorCode || payload.errorType || !res.ok) {
    throw new DhanApiError(
      payload?.errorMessage ?? `Dhan token generation failed (HTTP ${res.status})`,
      payload?.errorCode ? statusForErrorCode(payload.errorCode) : res.status,
      payload?.errorCode,
    );
  }
  if (!payload.accessToken || !payload.expiryTime) {
    throw new DhanApiError("Dhan token generation succeeded but returned no token.", 502);
  }
  return payload;
}

/* --------------------------------------------------------------- data calls */

export interface DhanIntradayResponse {
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  timestamp: number[];
  open_interest?: number[];
}

/** `POST /charts/intraday` — one call serves both candles and, with `oi:true`, the OI series Angel One needs two endpoints for. */
export async function dhanIntraday(
  creds: { accessToken: string; clientId: string },
  params: {
    securityId: string;
    exchangeSegment: string;
    instrument: string;
    interval: "1" | "5" | "15" | "25" | "60";
    fromDate: string;
    toDate: string;
    oi?: boolean;
  },
): Promise<DhanIntradayResponse> {
  return dhanApiCall<DhanIntradayResponse>(INTRADAY_URL, {
    method: "POST",
    accessToken: creds.accessToken,
    clientId: creds.clientId,
    body: {
      securityId: params.securityId,
      exchangeSegment: params.exchangeSegment,
      instrument: params.instrument,
      interval: params.interval,
      oi: params.oi ? "true" : "false",
      fromDate: params.fromDate,
      toDate: params.toDate,
    },
  });
}

/** `POST /charts/historical` — daily bars. Confirmed working for equity/index/futures; a *dated option contract's own* security ID returns DH-905, so this is not used for options (intraday, which does work for options, covers what the app needs there). */
export async function dhanHistorical(
  creds: { accessToken: string; clientId: string },
  params: {
    securityId: string;
    exchangeSegment: string;
    instrument: string;
    fromDate: string;
    toDate: string;
    oi?: boolean;
  },
): Promise<DhanIntradayResponse> {
  return dhanApiCall<DhanIntradayResponse>(HISTORICAL_URL, {
    method: "POST",
    accessToken: creds.accessToken,
    clientId: creds.clientId,
    body: {
      securityId: params.securityId,
      exchangeSegment: params.exchangeSegment,
      instrument: params.instrument,
      expiryCode: 0,
      oi: params.oi ? "true" : "false",
      fromDate: params.fromDate,
      toDate: params.toDate,
    },
  });
}

export interface DhanOptionLeg {
  average_price: number;
  greeks: { delta: number; theta: number; gamma: number; vega: number };
  implied_volatility: number;
  last_price: number;
  oi: number;
  previous_close_price: number;
  previous_oi: number;
  previous_volume: number;
  security_id: number;
  top_ask_price: number;
  top_ask_quantity: number;
  top_bid_price: number;
  top_bid_quantity: number;
  volume: number;
}

export interface DhanOptionChain {
  last_price: number;
  oc: Record<string, { ce?: DhanOptionLeg; pe?: DhanOptionLeg }>;
}

export async function dhanOptionChain(
  creds: { accessToken: string; clientId: string },
  params: { underlyingScrip: number; underlyingSeg: string; expiry: string },
): Promise<DhanOptionChain> {
  return dhanApiCall<DhanOptionChain>(OPTION_CHAIN_URL, {
    method: "POST",
    accessToken: creds.accessToken,
    clientId: creds.clientId,
    body: {
      UnderlyingScrip: params.underlyingScrip,
      UnderlyingSeg: params.underlyingSeg,
      Expiry: params.expiry,
    },
  });
}

export async function dhanExpiryList(
  creds: { accessToken: string; clientId: string },
  params: { underlyingScrip: number; underlyingSeg: string },
): Promise<string[]> {
  return dhanApiCall<string[]>(EXPIRY_LIST_URL, {
    method: "POST",
    accessToken: creds.accessToken,
    clientId: creds.clientId,
    body: { UnderlyingScrip: params.underlyingScrip, UnderlyingSeg: params.underlyingSeg },
  });
}

export interface DhanQuoteLeg {
  last_price: number;
  volume?: number;
  oi?: number;
  ohlc?: { open: number; high: number; low: number; close: number };
  depth?: {
    buy: { quantity: number; orders: number; price: number }[];
    sell: { quantity: number; orders: number; price: number }[];
  };
}

/** `POST /marketfeed/quote` — up to 1000 instruments per request, segment-keyed. */
export async function dhanQuote(
  creds: { accessToken: string; clientId: string },
  bySegment: Record<string, number[]>,
): Promise<Record<string, Record<string, DhanQuoteLeg>>> {
  return dhanApiCall<Record<string, Record<string, DhanQuoteLeg>>>(QUOTE_URL, {
    method: "POST",
    accessToken: creds.accessToken,
    clientId: creds.clientId,
    body: bySegment,
  });
}
