import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isExchange, isInterval, type HistoricalInterval } from "@/lib/market/constants";
import { parseDhanCandles, parseDhanOiSeries } from "@/lib/market/dhanParse";
import { candleDate, parseCandles, parseOiSeries } from "@/lib/market/parse";
import { readJson } from "@/lib/market/request";
import { DhanApiError, dhanIntraday } from "@/lib/server/dhan";
import {
  CANDLE_URL,
  OI_DATA_URL,
  SESSION_COOKIE,
  SmartApiError,
  decodeSession,
  smartApiCall,
} from "@/lib/server/smartapi";

/**
 * `POST /api/market/batch` — a whole ladder's history in one request.
 *
 * The browser used to ask for each contract separately: 22 strikes needed 44
 * round trips through this deployment before anything could be drawn, and the
 * latency of each one sat in series with the rate limiter. Asking here instead
 * collapses that to a single request from the page, and the fan-out to Angel
 * One runs from a machine that is already next to it — bounded by their rate
 * limit rather than by the round trip to the operator's laptop.
 *
 * Every contract is sliced to *one* session, the one the caller names. That is
 * a correctness fix as much as a speed one: asking each token for "its last
 * session" let an illiquid strike answer with a different day from its
 * neighbours, and a ladder quoting two different days is not a ladder.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** The fan-out below can take several seconds against a slow upstream. */
export const maxDuration = 60;

/**
 * Contracts per request. The client chunks; this is the backstop.
 *
 * Dhan fetches bars and OI from a single call per token (see `dhanIntraday`
 * below), so its ceiling and pool stay at their original values. SmartAPI
 * needs two separate metered calls per contract — see `SMARTAPI_POOL` below
 * for the arithmetic this tighter ceiling protects against.
 */
const DHAN_MAX_TOKENS = 25;
const SMARTAPI_MAX_TOKENS = 12;

/** Upstream calls in flight, Dhan branch. One call per token, so this can
 *  stay as wide as Dhan's own limiters (see `dhan.ts`) allow. */
const DHAN_POOL = 3;
/**
 * Upstream calls in flight, SmartAPI branch.
 *
 * Angel One's OI endpoint is throttled to 1 request/sec for the whole
 * deployment (see `smartapi.ts`), so raising this past the old value of 3
 * doesn't buy more real throughput against that ceiling — what it buys is
 * keeping that 1/sec channel continuously fed instead of idling while a
 * pool slot sits blocked on its own token's *candle* leg finishing first.
 * Paired with fetching each token's candle and OI concurrently (below,
 * instead of one after the other) and the tighter `SMARTAPI_MAX_TOKENS`
 * ceiling, this keeps a request's worst-case wall time well inside the 60s
 * function budget even when it lands next to other users' requests on the
 * same shared limiter — which is what was pushing `/api/market/batch` past
 * `maxDuration` in production.
 */
const SMARTAPI_POOL = 6;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Run `worker` over `items`, `poolSize` at a time, never rejecting. */
async function pooled<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
  poolSize: number,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(poolSize, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await worker(items[i]);
    }
  });
  await Promise.all(runners);
  return out;
}

export async function POST(request: Request) {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(
      { detail: "Historical data requires an active broker session." },
      { status: 401 },
    );
  }

  const raw = (await readJson(request)) as Record<string, unknown> | null;
  const date = String(raw?.date ?? "");
  const tokens = Array.isArray(raw?.tokens)
    ? [...new Set(raw.tokens.map((t) => String(t)))].filter((t) =>
        /^\d{1,12}$/.test(t),
      )
    : [];
  const wantOi = raw?.oi !== false;
  const wantBars = raw?.candles !== false;
  const interval: HistoricalInterval = isInterval(raw?.interval)
    ? raw.interval
    : "FIVE_MINUTE";
  // Every token in one call is one underlying's own chain, so one exchange
  // covers the whole batch — NIFTY/BANKNIFTY/FINNIFTY's options are on NFO,
  // BANKEX/SENSEX's are on BFO. Default keeps existing callers unchanged.
  const exchange = isExchange(raw?.exchange) ? raw.exchange : "NFO";
  // Dhan's own exchange-segment vocabulary — only read on the Dhan branch below.
  const exchangeSegment = String(raw?.exchangeSegment ?? "NSE_FNO");
  const instrument = String(raw?.instrument ?? "OPTIDX");

  if (!DATE_PATTERN.test(date)) {
    return NextResponse.json({ detail: "date must be YYYY-MM-DD." }, { status: 400 });
  }
  if (!tokens.length) {
    return NextResponse.json(
      { detail: "tokens must be a non-empty array of numeric scrip tokens." },
      { status: 400 },
    );
  }
  const maxTokens = session.broker === "dhan" ? DHAN_MAX_TOKENS : SMARTAPI_MAX_TOKENS;
  if (tokens.length > maxTokens) {
    return NextResponse.json(
      { detail: `At most ${maxTokens} tokens per request; got ${tokens.length}.` },
      { status: 400 },
    );
  }

  if (session.broker === "dhan") {
    const dhanInterval = interval === "ONE_MINUTE" ? "1" : interval === "FIFTEEN_MINUTE" ? "15" : "5";
    const fromDate = `${date} 09:15:00`;
    const toDate = `${date} 15:40:00`;
    let rateLimited = false;

    const contracts = await pooled(tokens, async (securityId) => {
      const entry: {
        token: string;
        bars?: unknown;
        series?: unknown;
        open_oi?: number | null;
        last_oi?: number | null;
        error?: string;
      } = { token: securityId };

      if ((wantBars || wantOi) && !rateLimited) {
        try {
          const data = await dhanIntraday(
            { accessToken: session.accessToken, clientId: session.clientCode },
            {
              securityId,
              exchangeSegment,
              instrument,
              interval: dhanInterval,
              fromDate,
              toDate,
              oi: wantOi,
            },
          );
          if (wantBars) entry.bars = parseDhanCandles(data).filter((c) => candleDate(c) === date);
          if (wantOi) {
            const series = parseDhanOiSeries(data).filter((p) => p.time.slice(0, 10) === date);
            entry.series = series;
            entry.open_oi = series.length ? series[0].oi : null;
            entry.last_oi = series.length ? series[series.length - 1].oi : null;
          }
        } catch (err) {
          if (err instanceof DhanApiError && err.status === 429) rateLimited = true;
          entry.error = err instanceof Error ? err.message : "fetch failed";
        }
      }
      return entry;
    }, DHAN_POOL);

    return NextResponse.json({ date, interval, rate_limited: rateLimited, contracts });
  }

  const from = `${date} 09:15`;
  const to = `${date} 15:40`;
  let rateLimited = false;

  const contracts = await pooled(tokens, async (token) => {
    const entry: {
      token: string;
      bars?: unknown;
      series?: unknown;
      open_oi?: number | null;
      last_oi?: number | null;
      error?: string;
    } = { token };

    // One contract's failure is its own: an illiquid strike or a token the
    // master and the exchange disagree on must not empty the whole ladder.
    //
    // Candle and OI are fired concurrently rather than one after the other —
    // sequential awaits here used to chain each token's two legs, so a pool
    // slot sat blocked on its own candle fetch before it could even queue
    // for OI's 1/sec limiter. Firing both at once lets that limiter's queue
    // fill immediately, which is what keeps a full pool worth of tokens'
    // wall time close to the limiter's real throughput instead of stacking
    // on top of it.
    await Promise.all([
      (async () => {
        if (!wantBars || rateLimited) return;
        try {
          const data = await smartApiCall<unknown>(CANDLE_URL, {
            method: "POST",
            body: { exchange, symboltoken: token, interval, fromdate: from, todate: to },
            jwt: session.jwtToken,
          });
          // Pinned to the requested day, so the ladder cannot mix sessions.
          entry.bars = parseCandles(data).filter((c) => candleDate(c) === date);
        } catch (err) {
          if (err instanceof SmartApiError && err.status === 429) rateLimited = true;
          entry.error = err instanceof Error ? err.message : "candle fetch failed";
        }
      })(),
      (async () => {
        if (!wantOi || rateLimited) return;
        try {
          const data = await smartApiCall<unknown>(OI_DATA_URL, {
            method: "POST",
            body: {
              exchange,
              symboltoken: token,
              interval: "FIFTEEN_MINUTE",
              fromdate: from,
              todate: to,
            },
            jwt: session.jwtToken,
          });
          const series = parseOiSeries(data).filter((p) => p.time.slice(0, 10) === date);
          entry.series = series;
          entry.open_oi = series.length ? series[0].oi : null;
          entry.last_oi = series.length ? series[series.length - 1].oi : null;
        } catch (err) {
          if (err instanceof SmartApiError && err.status === 429) rateLimited = true;
          entry.error = err instanceof Error ? err.message : "oi fetch failed";
        }
      })(),
    ]);

    return entry;
  }, SMARTAPI_POOL);

  return NextResponse.json({
    date,
    interval,
    rate_limited: rateLimited,
    contracts,
  });
}
