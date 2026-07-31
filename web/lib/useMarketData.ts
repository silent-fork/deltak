"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isMarketOpen } from "@/lib/engine/config";
import { ApiError } from "@/lib/api";
import { fetchBuildup, fetchCandles, fetchOi, fetchPcr } from "@/lib/market/client";
import { MARKET_OPEN_STAMP, istDate, sessionWindow } from "@/lib/market/clock";
import { pcrForUnderlying } from "@/lib/market/parse";
import type { OiBuildupExpiry, OiBuildupType } from "@/lib/market/constants";
import type {
  Candle,
  OiBuildupRow,
  OiPoint,
  SessionStats,
} from "@/lib/types";

/**
 * Historical and market-data context for the terminal.
 *
 * The live feed only knows what has happened since the socket opened. That is
 * enough to price a trade and wrong for almost everything else the HUD claims
 * to show: a session joined at noon has no morning, and — worse — no
 * session-open open interest, which is the baseline the entire COA 2.0 layer
 * is computed against. These four endpoints fill that in:
 *
 *  - `getCandleData` gives the session its actual shape (open, high, low, and
 *    the previous close every change% is quoted against).
 *  - `getOIData` gives each contract its session-open OI, so ΔOI is a real
 *    intraday delta rather than "whatever has moved since you connected".
 *  - `putCallRatio` gives the cumulative, whole-market PCR to set against the
 *    chain window's own.
 *  - `OIBuildup` gives the market-wide accumulation/unwind picture.
 *
 * Everything here is a progressive enhancement: each panel renders from the
 * live feed alone, and gets sharper as these land. Nothing blocks the 1 Hz
 * trading loop, and no failure here can stop a circuit breaker.
 */

/** Trading-day lookback for the candle window — enough to clear a long weekend. */
const CANDLE_LOOKBACK_DAYS = 5;

const POLL_OPEN = {
  candles: 60_000,
  walls: 180_000,
  pcr: 300_000,
  buildup: 300_000,
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
  /** Cumulative market-wide PCR, by underlying. */
  pcr: Record<string, number>;
  pcrAt: string | null;
  buildup: OiBuildupRow[];
  buildupAt: string | null;
  buildupType: OiBuildupType;
  buildupExpiry: OiBuildupExpiry;
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
  /** Called once per contract with its session-open open interest. */
  onOiBaseline: (token: string, oi: number) => void;
}

const EMPTY: MarketData = {
  available: false,
  candles: [],
  stats: null,
  oiSeries: {},
  seeded: 0,
  seeding: false,
  pcr: {},
  pcrAt: null,
  buildup: [],
  buildupAt: null,
  buildupType: "Long Built Up",
  buildupExpiry: "NEAR",
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

export function useMarketData(input: MarketDataInput): MarketData & {
  setBuildupType: (t: OiBuildupType) => void;
  setBuildupExpiry: (e: OiBuildupExpiry) => void;
} {
  const { enabled, focus, spotToken, seedTokens, wallTokens, onOiBaseline } = input;

  const [state, setState] = useState<MarketData>(EMPTY);
  const [buildupType, setBuildupType] = useState<OiBuildupType>("Long Built Up");
  const [buildupExpiry, setBuildupExpiry] = useState<OiBuildupExpiry>("NEAR");

  // `date:token` for every contract already baselined, so a drifting ATM band
  // only ever costs a request for the strikes that are genuinely new.
  const seenRef = useRef(new Set<string>());
  const baselineRef = useRef(onOiBaseline);
  baselineRef.current = onOiBaseline;

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
    setState((s) => ({ ...s, candles: [], stats: null, oiSeries: {} }));
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

  /* ------------------------------------------- COA 2.0 open-interest seed */

  const seedKey = seedTokens.join(",");

  useEffect(() => {
    if (!enabled || !seedKey) return;
    let cancelled = false;
    const date = istDate();

    void (async () => {
      const pending = seedKey
        .split(",")
        .filter((t) => t && !seenRef.current.has(`${date}:${t}`));
      if (!pending.length) return;
      setState((s) => ({ ...s, seeding: true }));

      for (const token of pending) {
        if (cancelled) return;
        try {
          // Only the first bar of the day is needed, so the window is fixed at
          // the open: the request is identical all session and answers from
          // cache on every later pass.
          const res = await fetchOi(
            {
              exchange: "NFO",
              symboltoken: token,
              interval: "FIFTEEN_MINUTE",
              fromdate: `${date} ${MARKET_OPEN_STAMP}`,
              todate: `${date} 09:30`,
            },
            // Cached for the whole session — the session's open never changes.
            12 * 60 * 60_000,
          );
          if (cancelled) return;
          if (res.open_oi && res.open_oi > 0) {
            seenRef.current.add(`${date}:${token}`);
            baselineRef.current(token, res.open_oi);
            setState((s) => ({ ...s, seeded: seenRef.current.size }));
          }
        } catch (err) {
          if (cancelled) return;
          fail(err);
          // A throttle or a dead session will hit every remaining contract the
          // same way; stop rather than grinding through the whole ladder.
          break;
        }
      }
      if (!cancelled) setState((s) => ({ ...s, seeding: false }));
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, seedKey, fail]);

  /* ---------------------------------------------------------- wall curves */

  const wallKey = wallTokens.join(",");

  usePoll(
    enabled && wallTokens.length > 0,
    `walls:${wallKey}`,
    POLL_OPEN.walls,
    useCallback(async () => {
      const date = istDate();
      const window = sessionWindow(0);
      for (const token of wallKey.split(",").filter(Boolean)) {
        try {
          const res = await fetchOi({
            exchange: "NFO",
            symboltoken: token,
            interval: "FIFTEEN_MINUTE",
            fromdate: `${date} ${MARKET_OPEN_STAMP}`,
            todate: window.todate,
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
              baselineRef.current(token, res.open_oi);
              setState((s) => ({ ...s, seeded: seenRef.current.size }));
            }
          }
          ok();
        } catch (err) {
          fail(err);
          break;
        }
      }
    }, [wallKey, fail, ok]),
  );

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

  /* ---------------------------------------------------------- oi buildup */

  usePoll(
    enabled,
    `buildup:${buildupExpiry}:${buildupType}`,
    POLL_OPEN.buildup,
    useCallback(async () => {
      try {
        const res = await fetchBuildup(buildupType, buildupExpiry);
        setState((s) => ({
          ...s,
          buildup: res.rows,
          buildupAt: res.fetched_at,
        }));
        ok();
      } catch (err) {
        fail(err);
      }
    }, [buildupType, buildupExpiry, fail, ok]),
  );

  /* --------------------------------------------------------------- reset */

  useEffect(() => {
    if (enabled) return;
    seenRef.current.clear();
    setState(EMPTY);
  }, [enabled]);

  return {
    ...state,
    available: enabled,
    buildupType,
    buildupExpiry,
    setBuildupType,
    setBuildupExpiry,
  };
}
