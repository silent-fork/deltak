import { ApiError, api } from "@/lib/api";
import type {
  BatchResponse,
  BuildupResponse,
  CandleResponse,
  MarginPosition,
  MarginResponse,
  OiResponse,
  PcrResponse,
} from "@/lib/types";
import type {
  HistoricalExchange,
  HistoricalInterval,
  OiBuildupExpiry,
  OiBuildupType,
} from "./constants";

/**
 * Browser client for the historical and market-data routes.
 *
 * Angel One meters these endpoints per API key, at a few requests a second —
 * far below what a 25-strike chain would ask for if each panel fetched
 * independently. So every call in the tab funnels through one queue that
 * spaces requests out, and identical requests share a single flight and a
 * short-lived cache. The rest of the app can then ask for what it wants,
 * whenever it wants, without any component knowing about the limit.
 */

const BASE_GAP_MS = 340;
const MAX_GAP_MS = 4_000;
/**
 * Requests allowed in flight at once.
 *
 * Angel One publishes a *rate*, and a strictly serial queue does not deliver
 * it: waiting for each reply before dispatching the next caps throughput at
 * 1/(gap + round trip), which with a half-second round trip is barely one
 * request a second however small the gap. That is what made a 22-contract
 * ladder fill one strike at a time. Dispatching on the clock and letting a few
 * overlap fills the pipe up to the documented rate and no further.
 */
const MAX_IN_FLIGHT = 3;

let gapMs = BASE_GAP_MS;
let lastDispatch = 0;
let inFlight = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wait for a dispatch slot: under the concurrency cap, and past the gap. */
async function acquire(): Promise<void> {
  for (;;) {
    const since = Date.now() - lastDispatch;
    if (inFlight < MAX_IN_FLIGHT && since >= gapMs) {
      inFlight += 1;
      lastDispatch = Date.now();
      return;
    }
    await sleep(since < gapMs ? Math.max(5, gapMs - since) : 20);
  }
}

/** Pace upstream calls: `gapMs` between dispatches, `MAX_IN_FLIGHT` at once. */
async function schedule<T>(job: () => Promise<T>): Promise<T> {
  await acquire();
  try {
    const value = await job();
    // Ease back towards the base spacing once calls are landing again.
    gapMs = Math.max(BASE_GAP_MS, gapMs * 0.8);
    return value;
  } catch (err) {
    // A throttle is the one error worth changing behaviour over: widen the
    // spacing so the next caller does not walk into the same wall.
    if (err instanceof ApiError && err.status === 429) {
      gapMs = Math.min(MAX_GAP_MS, Math.max(BASE_GAP_MS * 2, gapMs * 2));
    }
    throw err;
  } finally {
    inFlight -= 1;
  }
}

interface Entry {
  at: number;
  value: unknown;
}

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

function cached<T>(key: string, ttlMs: number, job: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value as T);

  const running = inflight.get(key);
  if (running) return running as Promise<T>;

  const flight = schedule(job)
    .then((value) => {
      cache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(key));

  inflight.set(key, flight);
  return flight;
}

/** Drop everything cached — used when the session changes underneath us. */
export function clearMarketCache(): void {
  cache.clear();
}

/* ------------------------------------------------------------------ calls */

export interface CandleRequest {
  exchange: HistoricalExchange;
  symboltoken: string;
  interval: HistoricalInterval;
  fromdate: string;
  todate: string;
}

/** Intraday candles are only worth re-reading once a bar can have closed. */
export function fetchCandles(req: CandleRequest, ttlMs = 45_000) {
  return cached<CandleResponse>(`candles:${JSON.stringify(req)}`, ttlMs, () =>
    api.market.candles(req),
  );
}

export function fetchOi(req: CandleRequest, ttlMs = 120_000) {
  return cached<OiResponse>(`oi:${JSON.stringify(req)}`, ttlMs, () =>
    api.market.oi(req),
  );
}

/**
 * A ladder's session in one call.
 *
 * Cached on the exact request, and long: a finished session does not change,
 * and a live one is re-asked by the poll that owns it rather than by whoever
 * happens to re-render.
 */
export function fetchBatch(
  body: { date: string; tokens: string[]; oi?: boolean; candles?: boolean },
  ttlMs = 120_000,
) {
  return cached<BatchResponse>(`batch:${JSON.stringify(body)}`, ttlMs, () =>
    api.market.batch(body),
  );
}

export function fetchPcr(ttlMs = 120_000) {
  return cached<PcrResponse>("pcr", ttlMs, () => api.market.pcr());
}

/**
 * Margin for a basket. Cached on the exact basket: the panel re-asks whenever
 * lots change, and an operator nudging the stepper should not spend a request
 * per keypress.
 */
export function fetchMargin(positions: MarginPosition[], ttlMs = 60_000) {
  return cached<MarginResponse>(
    `margin:${JSON.stringify(positions)}`,
    ttlMs,
    () => api.market.margin({ positions }),
  );
}

export function fetchBuildup(
  datatype: OiBuildupType,
  expirytype: OiBuildupExpiry,
  ttlMs = 120_000,
) {
  return cached<BuildupResponse>(`buildup:${expirytype}:${datatype}`, ttlMs, () =>
    api.market.buildup({ datatype, expirytype }),
  );
}
