import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isExchange, isInterval, type HistoricalInterval } from "@/lib/market/constants";
import { candleDate, parseCandles, parseOiSeries } from "@/lib/market/parse";
import { readJson } from "@/lib/market/request";
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

/** Contracts per request. The client chunks; this is the backstop. */
const MAX_TOKENS = 25;
/**
 * Upstream calls in flight.
 *
 * Angel One meters the historical endpoints at a few a second per key, so this
 * is deliberately modest: the win here is removing 44 browser round trips, not
 * out-running the broker's limiter.
 */
const POOL = 3;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Run `worker` over `items`, `POOL` at a time, never rejecting. */
async function pooled<T, R>(
  items: T[],
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(POOL, items.length) }, async () => {
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
      { detail: "Historical data requires a SmartAPI session." },
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

  if (!DATE_PATTERN.test(date)) {
    return NextResponse.json({ detail: "date must be YYYY-MM-DD." }, { status: 400 });
  }
  if (!tokens.length) {
    return NextResponse.json(
      { detail: "tokens must be a non-empty array of numeric scrip tokens." },
      { status: 400 },
    );
  }
  if (tokens.length > MAX_TOKENS) {
    return NextResponse.json(
      { detail: `At most ${MAX_TOKENS} tokens per request; got ${tokens.length}.` },
      { status: 400 },
    );
  }

  const from = `${date} 09:15`;
  const to = `${date} 15:30`;
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
    if (wantBars && !rateLimited) {
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
    }

    if (wantOi && !rateLimited) {
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
    }

    return entry;
  });

  return NextResponse.json({
    date,
    interval,
    rate_limited: rateLimited,
    contracts,
  });
}
