import { ApiError, api } from "@/lib/api";
import type {
  BatchResponse,
  BuildupResponse,
  CandleResponse,
  HolidayResponse,
  MarginPosition,
  MarginResponse,
  NseOptionChainResponse,
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
 * Angel One's own per-endpoint rate now has an authoritative gate server-side
 * (`RateLimiter` in `lib/server/smartapi.ts`, shared across every request
 * hitting this deployment, not just this tab) — so this queue's job is no
 * longer to approximate that limit itself, only to keep identical requests
 * deduped and cached, and to stop this one tab from opening an unbounded
 * pile of sockets to its own server.
 *
 * That distinction matters: a low `MAX_IN_FLIGHT` here used to also be the
 * only thing standing between the browser and Angel One's limiter. Now that
 * the server paces the real upstream calls, a low cap here does nothing but
 * head-of-line-block unrelated fast requests behind one slow one — a batch
 * request seeding a 24-token near-ATM band now legitimately takes many
 * seconds server-side (each leg's own OI call queued behind its endpoint's
 * real rate), and with only 3 client-side slots, that single slow request
 * could occupy a third of them for its whole duration, stalling the four
 * background-index candle polls (NSE and BSE alike — neither depends on the
 * batch route at all) behind it for no reason connected to any real limit.
 */

const BASE_GAP_MS = 60;
const MAX_GAP_MS = 4_000;
/**
 * Requests allowed in flight at once, from this tab to this deployment.
 *
 * High enough to cover every distinct thing `useMarketData` can legitimately
 * have in flight together on a fresh load — the focused underlying's candles
 * and its batch seed, four background-index candle polls, two wall curves,
 * PCR, buildup, holidays, an NSE snapshot — without any of them queueing
 * behind another just because a client-side number said no. The real ceiling
 * against Angel One is the server-side limiter, not this.
 */
const MAX_IN_FLIGHT = 12;

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
  body: {
    date: string;
    tokens: string[];
    oi?: boolean;
    candles?: boolean;
    exchange?: HistoricalExchange;
  },
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

/**
 * NSE's F&O holiday calendar. A 15-minute TTL matches `HolidayMenu`'s own
 * poll cadence — the calendar itself barely ever changes, so this exists to
 * cap how often a stray extra poll can actually reach NSE, not because the
 * data goes stale that fast.
 */
export function fetchHolidays(ttlMs = 15 * 60_000) {
  return cached<HolidayResponse>("holidays", ttlMs, () => api.market.holidays());
}

/**
 * NSE's own option-chain snapshot for one underlying — a closed-market
 * gap-filler, not a live feed. Long TTL: it is a single point-in-time read
 * that will not change again until NSE's next session.
 */
export function fetchNseOptionChain(underlying: string, ttlMs = 20 * 60_000) {
  return cached<NseOptionChainResponse>(`nse-oc:${underlying}`, ttlMs, () =>
    api.market.nseOptionChain(underlying),
  );
}
