"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isMarketOpen } from "@/lib/engine/config";
import { MIN_SAMPLES } from "@/lib/engine/rrg";
import { ApiError } from "@/lib/api";
import { fetchCandles, fetchOi, fetchPcr } from "@/lib/market/client";
import { MARKET_OPEN_STAMP, istDate, sessionWindow } from "@/lib/market/clock";
import { pcrForUnderlying } from "@/lib/market/parse";
import type { Candle, OiPoint, SessionStats } from "@/lib/types";

/**
 * Historical and market-data context for the terminal.
 *
 * The live feed only knows what has happened since the socket opened. That is
 * enough to price a trade and wrong for almost everything else the HUD claims
 * to show: a session joined at noon has no morning, and — worse — no
 * session-open open interest, which is the baseline the entire COA 2.0 layer
 * is computed against. These reads fill that in:
 *
 *  - `getCandleData` gives the session its actual shape (open, high, low, and
 *    the previous close every change% is quoted against).
 *  - `getOIData` gives each contract its session-open OI, so ΔOI is a real
 *    intraday delta rather than "whatever has moved since you connected".
 *  - `putCallRatio` gives the cumulative, whole-market PCR to set against the
 *    chain window's own.
 *
 * (`OIBuildup` is served by `/api/market/buildup` but nothing renders it, so
 * nothing here polls for it — an unread feed is just metered requests spent.)
 *
 * Everything here is a progressive enhancement: each panel renders from the
 * live feed alone, and gets sharper as these land. Nothing blocks the 1 Hz
 * trading loop, and no failure here can stop a circuit breaker.
 */

/** Trading-day lookback for the candle window — enough to clear a long weekend. */
const CANDLE_LOOKBACK_DAYS = 5;
/** A finished session's open interest never changes again. */
const OI_SESSION_TTL_MS = 12 * 60 * 60_000;
/** Bar interval for the closed-market replay — a session is 75 of these. */
const REPLAY_INTERVAL = "FIVE_MINUTE" as const;
/** How long per-contract results are pooled before one render. */
const FLUSH_MS = 250;

const POLL_OPEN = {
  candles: 60_000,
  walls: 180_000,
  pcr: 300_000,
};
/** Out of hours nothing is moving; keep the loops alive, ten times slower. */
const CLOSED_MULTIPLIER = 10;

export interface MarketData {
  /** Historical data needs a broker session — false in demo/simulated mode. */
  available: boolean;
  /** Session bars for the focused underlying's index spot. */
  candles: Candle[];
  stats: SessionStats | null;
  /** Intraday OI series by scrip token. */
  oiSeries: Record<string, OiPoint[]>;
  /** Contracts whose session-open OI baseline has been established. */
  seeded: number;
  seeding: boolean;
  /** Contracts replayed from history because the market is shut. */
  replayed: number;
  /** Cumulative market-wide PCR, by underlying. */
  pcr: Record<string, number>;
  pcrAt: string | null;
  loading: boolean;
  error: string | null;
}

export interface MarketDataInput {
  enabled: boolean;
  /** Underlying whose intraday detail the HUD is currently showing. */
  focus: string;
  /** NSE token of that underlying's index spot. */
  spotToken: string;
  /** NFO tokens whose session-open OI should be baselined, nearest ATM first. */
  seedTokens: string[];
  /** The two wall contracts, whose OI curve is drawn. */
  wallTokens: string[];
  /**
   * Called once per contract with its session-open open interest, and the last
   * reading of the window alongside it.
   */
  onOiBaseline: (token: string, openOi: number, lastOi: number) => void;
  /**
   * Called out of hours with a contract's session replayed against the index:
   * `[premium, spot]` bar by bar, plus what it closed at. This is what lets the
   * rotation graph and the ladder show the last session instead of blanks.
   */
  onContractSession: (
    token: string,
    replay: { pairs: [number, number][]; lastClose: number; volume: number },
  ) => void;
}

const EMPTY: MarketData = {
  available: false,
  candles: [],
  stats: null,
  oiSeries: {},
  seeded: 0,
  seeding: false,
  replayed: 0,
  pcr: {},
  pcrAt: null,
  loading: false,
  error: null,
};

/**
 * Poll `run` on a schedule that widens when the market is shut.
 *
 * A `setTimeout` chain rather than `setInterval`: the delay is re-read after
 * every run, so the loop slows down at 3:30 PM without being torn down and
 * rebuilt, and a slow response can never stack two runs on top of each other.
 */
function usePoll(
  enabled: boolean,
  key: string,
  baseMs: number,
  run: () => Promise<void>,
) {
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cycle = async () => {
      try {
        await runRef.current();
      } catch {
        /* surfaced through state by the caller */
      }
      if (cancelled) return;
      timer = setTimeout(
        cycle,
        baseMs * (isMarketOpen() ? 1 : CLOSED_MULTIPLIER),
      );
    };
    void cycle();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // `key` folds every input the caller wants a restart on into one dep.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, baseMs]);
}

export function useMarketData(input: MarketDataInput): MarketData {
  const {
    enabled,
    focus,
    spotToken,
    seedTokens,
    wallTokens,
    onOiBaseline,
    onContractSession,
  } = input;

  const [state, setState] = useState<MarketData>(EMPTY);

  // `date:token` for every contract already baselined, so a drifting ATM band
  // only ever costs a request for the strikes that are genuinely new.
  const seenRef = useRef(new Set<string>());
  const replayedRef = useRef(new Set<string>());
  /**
   * Per-contract results land here and are flushed together.
   *
   * Twenty-two contracts arriving one at a time is twenty-two state updates,
   * each a render and a chain rebuild — the ladder visibly filling a strike at
   * a time. Pooling them costs a quarter-second of latency and saves every
   * render but one per burst.
   */
  const pendingSeriesRef = useRef<Record<string, OiPoint[]>>({});
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baselineRef = useRef(onOiBaseline);
  baselineRef.current = onOiBaseline;
  const replayRef = useRef(onContractSession);
  replayRef.current = onContractSession;
  // The spot session doubles as the RRG benchmark, read at call time so the
  // replay does not restart every time a candle poll lands.
  const spotCandlesRef = useRef(state.candles);
  spotCandlesRef.current = state.candles;

  /**
   * The session everything else is keyed to.
   *
   * On a Saturday "today" has no bars, so every historical window would come
   * back empty. The candle response already reports which date it actually
   * returned, so that date — Friday's — is what the OI and replay passes ask
   * for too, and the whole board lands on one consistent session.
   */
  const sessionDate = state.stats?.date ?? istDate();

  /**
   * Whether the index has enough bars to act as the replay's benchmark.
   *
   * A flag rather than the array, so the replay re-runs exactly once — when the
   * spot session first lands — and not on every candle poll. Without it, a pass
   * that started before the benchmark simply never replayed and the rotation
   * graph stayed empty for good: switching instrument clears the candles and
   * changes the token list in the same breath, so the pass reliably ran with
   * nothing to rotate against.
   */
  const benchmarkReady = state.candles.length >= MIN_SAMPLES;

  const flush = useCallback(() => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      const batch = pendingSeriesRef.current;
      pendingSeriesRef.current = {};
      setState((s) => ({
        ...s,
        oiSeries: Object.keys(batch).length ? { ...s.oiSeries, ...batch } : s.oiSeries,
        seeded: seenRef.current.size,
        replayed: replayedRef.current.size,
      }));
    }, FLUSH_MS);
  }, []);

  useEffect(
    () => () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    },
    [],
  );

  const fail = useCallback((err: unknown) => {
    const message =
      err instanceof ApiError
        ? err.status === 401
          ? "Historical data needs a live broker session."
          : err.message
        : err instanceof Error
          ? err.message
          : "Market data request failed.";
    setState((s) => (s.error === message ? s : { ...s, error: message }));
  }, []);

  const ok = useCallback(() => {
    setState((s) => (s.error === null ? s : { ...s, error: null }));
  }, []);

  /* ------------------------------------------------------------- candles */

  // Switching instrument drops the old session immediately: a trace spliced
  // from two different price scales is worse than no trace at all.
  useEffect(() => {
    setState((s) => ({
      ...s,
      candles: [],
      stats: null,
      oiSeries: {},
      replayed: 0,
    }));
    replayedRef.current.clear();
  }, [focus]);

  usePoll(
    enabled && !!spotToken,
    `candles:${focus}:${spotToken}`,
    POLL_OPEN.candles,
    useCallback(async () => {
      if (!spotToken) return;
      setState((s) => ({ ...s, loading: true }));
      try {
        const res = await fetchCandles({
          exchange: "NSE",
          symboltoken: spotToken,
          interval: "ONE_MINUTE",
          ...sessionWindow(CANDLE_LOOKBACK_DAYS),
        });
        setState((s) => ({
          ...s,
          candles: res.session,
          stats: res.stats,
          loading: false,
        }));
        ok();
      } catch (err) {
        setState((s) => ({ ...s, loading: false }));
        fail(err);
      }
    }, [spotToken, fail, ok]),
  );

  /* ------------------------------ session seeding: open interest and replay */

  const seedKey = seedTokens.join(",");

  /**
   * Everything the focused ladder needs from history, in one pass.
   *
   * Two independent reads per contract — `getOIData` for the session's open
   * interest, `getCandleData` for its bars — fired as a pool and paced by the
   * shared rate limiter rather than by the loop. Awaiting each reply before
   * sending the next request cost a full round trip per contract on top of the
   * gap, which is what made the board fill one strike at a time.
   *
   * The open-interest half runs whatever the hour: it is the COA 2.0 baseline,
   * and a session joined at noon needs it as much as a Saturday does. The
   * replay half runs only when the market is shut — in session the feed is the
   * better source and stale bars would drag every node backwards.
   */
  useEffect(() => {
    if (!enabled || !seedKey) return;
    let cancelled = false;
    let throttled = false;
    const date = sessionDate;
    const tokens = seedKey.split(",").filter(Boolean);
    const closed = !isMarketOpen();

    const guard = (err: unknown) => {
      if (cancelled) return;
      // A throttle hits every remaining contract the same way, so it stops the
      // pool. Anything else is one contract's problem — an illiquid strike, a
      // token the master and the exchange disagree on — and abandoning the rest
      // of the ladder over it leaves a rotation graph with four nodes and no
      // explanation.
      if (err instanceof ApiError && err.status === 429) throttled = true;
      fail(err);
    };

    const seedOi = async (token: string) => {
      if (cancelled || throttled || seenRef.current.has(`${date}:${token}`)) return;
      try {
        // The window is fixed to the whole session rather than tracking the
        // clock, so the request is identical all day and answers from cache on
        // every later pass. Both ends are wanted: the first reading is the ΔOI
        // baseline, the last is what the ladder shows once the feed stops.
        const res = await fetchOi(
          {
            exchange: "NFO",
            symboltoken: token,
            interval: "FIFTEEN_MINUTE",
            fromdate: `${date} ${MARKET_OPEN_STAMP}`,
            todate: `${date} 15:30`,
          },
          OI_SESSION_TTL_MS,
        );
        if (cancelled || !res.open_oi || res.open_oi <= 0) return;
        seenRef.current.add(`${date}:${token}`);
        baselineRef.current(token, res.open_oi, res.last_oi ?? 0);
        // The series is kept, not just its ends: the wall migration is
        // reconstructed from these same readings, at no extra request.
        pendingSeriesRef.current[token] = res.series;
        flush();
      } catch (err) {
        guard(err);
      }
    };

    const replay = async (token: string, benchmark: Map<string, number>) => {
      if (cancelled || throttled || replayedRef.current.has(`${date}:${token}`)) return;
      try {
        const res = await fetchCandles(
          {
            exchange: "NFO",
            symboltoken: token,
            interval: REPLAY_INTERVAL,
            ...sessionWindow(CANDLE_LOOKBACK_DAYS),
          },
          OI_SESSION_TTL_MS,
        );
        if (cancelled) return;

        const bars = res.session;
        // An untraded strike has no session; do not ask again today.
        replayedRef.current.add(`${date}:${token}`);
        if (!bars.length) return;

        const pairs: [number, number][] = [];
        let volume = 0;
        for (const bar of bars) {
          volume += bar.volume;
          const spotClose = benchmark.get(bar.time.slice(0, 16));
          if (spotClose && spotClose > 0 && bar.close > 0) {
            pairs.push([bar.close, spotClose]);
          }
        }

        replayRef.current(token, {
          pairs,
          lastClose: bars[bars.length - 1].close,
          volume,
        });
        flush();
        ok();
      } catch (err) {
        guard(err);
      }
    };

    void (async () => {
      setState((s) => ({ ...s, seeding: true }));

      // Spot closes by bar time, so an option bar pairs with the index at the
      // same instant rather than by position — the two series skip different
      // minutes when a strike goes untraded.
      const spot = spotCandlesRef.current;
      const benchmark = new Map(spot.map((c) => [c.time.slice(0, 16), c.close]));

      await Promise.all([
        ...tokens.map((t) => seedOi(t)),
        ...(closed && benchmarkReady ? tokens.map((t) => replay(t, benchmark)) : []),
      ]);

      if (!cancelled) setState((s) => ({ ...s, seeding: false }));
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, seedKey, sessionDate, benchmarkReady, flush, fail, ok]);

  /* ---------------------------------------------------------- wall curves */

  const wallKey = wallTokens.join(",");

  usePoll(
    enabled && wallTokens.length > 0,
    `walls:${wallKey}`,
    POLL_OPEN.walls,
    useCallback(async () => {
      const date = sessionDate;
      const window = sessionWindow(0);
      for (const token of wallKey.split(",").filter(Boolean)) {
        try {
          const res = await fetchOi({
            exchange: "NFO",
            symboltoken: token,
            interval: "FIFTEEN_MINUTE",
            fromdate: `${date} ${MARKET_OPEN_STAMP}`,
            // A closed session is finished, so its curve is asked for whole and
            // then cached; a live one is asked for up to the minute.
            todate: date === istDate() ? window.todate : `${date} 15:30`,
          });
          if (!res.series.length) continue;
          setState((s) => ({
            ...s,
            oiSeries: { ...s.oiSeries, [token]: res.series },
          }));
          // The curve's first point is the same session-open reading the seed
          // pass looks for, so a wall inside the band is baselined for free.
          if (res.open_oi && res.open_oi > 0) {
            const key = `${date}:${token}`;
            if (!seenRef.current.has(key)) {
              seenRef.current.add(key);
              baselineRef.current(token, res.open_oi, res.last_oi ?? 0);
              setState((s) => ({ ...s, seeded: seenRef.current.size }));
            }
          }
          ok();
        } catch (err) {
          fail(err);
          break;
        }
      }
    }, [wallKey, sessionDate, fail, ok]),
  );

  /* ------------------------------------------ closed-market session replay */

  /**
   * Out of hours the socket sends nothing, so the rotation graph has no series
   * to rotate and the ladder has no prices to show. The same candle endpoint
   * that draws the spot trace serves option contracts too, so each contract's
   * session is fetched and replayed against the index bar by bar — which is
   * exactly what the live feed would have fed the RRG windows, only after the
   * fact.
   *
   * In session this does nothing: the feed is the better source, and replaying
   * stale bars on top of live ones would drag every node backwards.
   */
  useEffect(() => {
    if (!enabled || !seedKey || isMarketOpen() || !benchmarkReady) return;
    const spot = spotCandlesRef.current;

    let cancelled = false;
    const date = sessionDate;
    // Spot closes by bar time, so an option bar can be paired with the index at
    // the same instant rather than by position — the two series skip different
    // minutes when a strike goes untraded.
    const benchmark = new Map(spot.map((c) => [c.time.slice(0, 16), c.close]));

    void (async () => {
      const pending = seedKey
        .split(",")
        .filter((t) => t && !replayedRef.current.has(`${date}:${t}`));
      if (!pending.length) return;

      for (const token of pending) {
        if (cancelled) return;
        try {
          const res = await fetchCandles(
            {
              exchange: "NFO",
              symboltoken: token,
              interval: REPLAY_INTERVAL,
              ...sessionWindow(CANDLE_LOOKBACK_DAYS),
            },
            OI_SESSION_TTL_MS,
          );
          if (cancelled) return;

          const bars = res.session;
          if (!bars.length) {
            // An untraded strike has no session; do not ask again today.
            replayedRef.current.add(`${date}:${token}`);
            continue;
          }

          const pairs: [number, number][] = [];
          let volume = 0;
          for (const bar of bars) {
            volume += bar.volume;
            const spotClose = benchmark.get(bar.time.slice(0, 16));
            if (spotClose && spotClose > 0 && bar.close > 0) {
              pairs.push([bar.close, spotClose]);
            }
          }

          replayedRef.current.add(`${date}:${token}`);
          replayRef.current(token, {
            pairs,
            lastClose: bars[bars.length - 1].close,
            volume,
          });
          setState((s) => ({ ...s, replayed: replayedRef.current.size }));
          ok();
        } catch (err) {
          if (cancelled) return;
          fail(err);
          // A throttle will hit every remaining contract the same way, so stop.
          // Anything else is this one contract's problem — an illiquid strike
          // with no session, a token the master and the exchange disagree on —
          // and abandoning the rest of the ladder over it leaves the rotation
          // graph with four nodes and no explanation.
          if (err instanceof ApiError && err.status === 429) break;
          replayedRef.current.add(`${date}:${token}`);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, seedKey, sessionDate, benchmarkReady, fail, ok]);

  /* -------------------------------------------------------------- pcr */

  usePoll(
    enabled,
    "pcr",
    POLL_OPEN.pcr,
    useCallback(async () => {
      try {
        const res = await fetchPcr();
        const today = istDate();
        const byUnderlying: Record<string, number> = {};
        for (const underlying of ["NIFTY", "BANKNIFTY", "FINNIFTY"]) {
          const row = pcrForUnderlying(res.rows, underlying, today);
          if (row) byUnderlying[underlying] = row.pcr;
        }
        setState((s) => ({ ...s, pcr: byUnderlying, pcrAt: res.fetched_at }));
        ok();
      } catch (err) {
        fail(err);
      }
    }, [fail, ok]),
  );

  /* --------------------------------------------------------------- reset */

  useEffect(() => {
    if (enabled) return;
    seenRef.current.clear();
    replayedRef.current.clear();
    setState(EMPTY);
  }, [enabled]);

  return { ...state, available: enabled };
}
