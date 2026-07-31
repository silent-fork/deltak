import { ApiError, api } from "@/lib/api";
import type {
  BuildupResponse,
  CandleResponse,
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

const BASE_GAP_MS = 350;
const MAX_GAP_MS = 4_000;

let gapMs = BASE_GAP_MS;
let lastDispatch = 0;
let tail: Promise<unknown> = Promise.resolve();

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Serialise upstream calls, holding `gapMs` between dispatches. */
function schedule<T>(job: () => Promise<T>): Promise<T> {
  const run = tail.then(async () => {
    const wait = gapMs - (Date.now() - lastDispatch);
    if (wait > 0) await sleep(wait);
    lastDispatch = Date.now();
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
    }
  });
  tail = run.catch(() => undefined);
  return run;
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

export function fetchPcr(ttlMs = 120_000) {
  return cached<PcrResponse>("pcr", ttlMs, () => api.market.pcr());
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
