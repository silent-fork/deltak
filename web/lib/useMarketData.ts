"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { INDEX_UNIVERSE, isMarketOpen, optionExchange } from "@/lib/engine/config";
import { MIN_SAMPLES } from "@/lib/engine/rrg";
import { ApiError } from "@/lib/api";
import {
  fetchBatch,
  fetchBuildup,
  fetchCandles,
  fetchMarketSnapshot,
  fetchNseOptionChain,
  fetchOi,
  fetchPcr,
} from "@/lib/market/client";
import { MARKET_OPEN_STAMP, istDate, sessionWindow } from "@/lib/market/clock";
import { OI_BUILDUP_TYPES, type OiBuildupType } from "@/lib/market/constants";
import { buildupIncludesUnderlying, pcrForUnderlying } from "@/lib/market/parse";
import type { Candle, NseOptionChainResponse, OiPoint, SessionStats } from "@/lib/types";

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
 *  - `OIBuildup` classifies each underlying's near-month futures as Long/Short
 *    Built Up, Short Covering or Long Unwinding — the same "price and OI
 *    together vs apart" question COA asks of one wall, asked of the futures
 *    market. The signal engine holds a thesis that contradicts it (e.g. a
 *    bullish call thesis against Short Built Up) rather than firing anyway.
 *
 * Everything here is a progressive enhancement: each panel renders from the
 * live feed alone, and gets sharper as these land. Nothing blocks the 1 Hz
 * trading loop, and no failure here can stop a circuit breaker.
 */

/** Trading-day lookback for the candle window — enough to clear a long weekend. */
const CANDLE_LOOKBACK_DAYS = 5;
/** How long per-contract results are pooled before one render. */
const FLUSH_MS = 250;
/**
 * Contracts per batch request — the route's own ceiling is 25 (`MAX_TOKENS`
 * in `/api/market/batch/route.ts`). A typical near-ATM seed window
 * (`oiSeedSpan` strikes either side, two legs each) is comfortably under
 * that, so this stays one request short of the ceiling rather than forcing
 * a second chunk — and therefore a second round trip — for a ladder that
 * would otherwise fit in one. The route's own `POOL` still governs how fast
 * each chunk's tokens actually reach Angel One; this only changes how many
 * chunks the browser has to wait on.
 */
const BATCH_TOKENS = 24;

const POLL_OPEN = {
  candles: 60_000,
  walls: 180_000,
  pcr: 300_000,
  /** Four requests (one per class) each cycle — slow on purpose. */
  buildup: 300_000,
  /** The unfocused indices only need to be roughly right. */
  backgroundSpots: 120_000,
};
/** A background quote may be two minutes stale without anyone minding. */
const BACKGROUND_SPOT_TTL_MS = 110_000;
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
  /** Session stats for every index, focused or not — the header reads these. */
  spotStats: Record<string, SessionStats>;
  /** Cumulative market-wide PCR, by underlying. */
  pcr: Record<string, number>;
  pcrAt: string | null;
  /** Each underlying's near-month futures OIBuildup class, once fetched. */
  buildup: Partial<Record<string, OiBuildupType>>;
  loading: boolean;
  error: string | null;
}

export interface MarketDataInput {
  enabled: boolean;
  /** Underlying whose intraday detail the HUD is currently showing. */
  focus: string;
  /** NSE token of that underlying's index spot. */
  spotToken: string;
  /**
   * Every index's spot token, focused or not. The header quotes all three, so
   * all three need a close — the two the operator is not looking at are worth
   * one slow request each rather than a blank ticker.
   */
  spotTokens: Record<string, string>;
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
  /**
   * Called out of hours with NSE's own option-chain snapshot for the
   * focused underlying (NSE-listed only) — a second, independent
   * closed-market source, additive on top of everything above.
   */
  onNseOptionChain?: (underlying: string, snapshot: NseOptionChainResponse) => void;
}

const EMPTY: MarketData = {
  available: false,
  candles: [],
  stats: null,
  oiSeries: {},
  seeded: 0,
  seeding: false,
  replayed: 0,
  spotStats: {},
  pcr: {},
  pcrAt: null,
  buildup: {},
  loading: false,
  error: null,
};

/**
 * PCR and OI-buildup come from Angel One's NSE F&O-wide gainers/losers-style
 * endpoints — there's no BSE equivalent product to poll, so BANKEX and
 * SENSEX simply never populate these two (both signals are already
 * "permissive when absent" in `dkms.ts`, so a missing entry just means one
 * fewer confirming layer, not a blocked signal).
 */
const NSE_UNDERLYING_NAMES = Object.entries(INDEX_UNIVERSE)
  .filter(([, spec]) => spec.exchange === "NSE")
  .map(([u]) => u);

/**
 * Poll `run` on a schedule that widens when the market is shut — and, once a
 * cycle actually lands while it's shut, stops rescheduling altogether rather
 * than continuing at the widened cadence. A closed market's numbers are one
 * session's, not a stream: there is nothing left to refresh until the next
 * one, so re-polling every ten minutes anyway was never buying anything but
 * needless load on Angel One and NSE alike.
 *
 * A `setTimeout` chain rather than `setInterval`: the delay is re-read after
 * every run, so the loop slows down at 3:30 PM without being torn down and
 * rebuilt, and a slow response can never stack two runs on top of each other.
 *
 * Stopping here means resuming has to come from outside: every call site's
 * own `key` must fold in the current `isMarketOpen()` reading (or something
 * equivalent — see the candles/background-spots/walls/PCR/buildup call
 * sites below), so that the market reopening changes `key`, remounts this
 * effect, and starts a fresh cycle rather than leaving a stopped poll idle
 * forever.
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
      let landed = false;
      try {
        await runRef.current();
        landed = true;
      } catch {
        /* surfaced through state by the caller */
      }
      if (cancelled) return;
      if (landed && !isMarketOpen()) return;
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
    spotTokens,
    seedTokens,
    wallTokens,
    onOiBaseline,
    onContractSession,
    onNseOptionChain,
  } = input;

  const [state, setState] = useState<MarketData>(EMPTY);

  /**
   * The closed-market DB-hydration check, per focus. `"checking"` holds every
   * live closed-market fetch below (candles, the batch seed, the NSE
   * snapshot) off until it resolves — reading the stored snapshot and
   * re-fetching from Angel One at the same time would race, and the whole
   * point is to skip the fetch when the store already has it. `"live"` means
   * either the market is open (this mechanism never applies then), the store
   * had nothing fresh, or what it had wasn't from *today's* own close — a
   * snapshot only ever gets written by a browser tab that was actually open
   * at the bell (see `useEngine.ts`'s save-on-close effect), so a stale row
   * just means no tab happened to be open then, not that nothing fresher
   * exists; the normal pipeline still runs and supersedes it. `"hydrated"`
   * means the store answered with *today's* own close and nothing below
   * should fetch at all — there is genuinely nothing fresher to find.
   */
  const [ready, setReady] = useState<"checking" | "hydrated" | "live">("checking");
  /** Open, or closed with nothing left to wait on — every gated effect below reads this one flag. */
  const liveFetchGate = isMarketOpen() || ready === "live";

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
  const nseSnapshotRef = useRef(onNseOptionChain);
  nseSnapshotRef.current = onNseOptionChain;
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

  /* ---------------------------------------- closed-market DB hydration */

  // A newly-focused underlying gets its own hydration check — skipped
  // outright while the market is open, since this mechanism only exists to
  // stand in for a fetch that would otherwise happen while closed.
  useEffect(() => {
    setReady(isMarketOpen() ? "live" : "checking");
  }, [focus]);

  /**
   * Read `market_snapshots` before any of the closed-market fetches below
   * get to run. A hit populates the same state a live fetch would (candles,
   * stats, this underlying's PCR/buildup reading) and folds its legs into
   * the tick store through the same callback the NSE snapshot uses — the
   * fold logic doesn't care which source a leg came from. A miss (or any
   * failure) just opens the gate for the normal pipeline below, unchanged.
   */
  useEffect(() => {
    if (!enabled || isMarketOpen()) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetchMarketSnapshot(focus);
        if (cancelled) return;
        if (!res.found) {
          setReady("live");
          return;
        }
        setState((s) => ({
          ...s,
          candles: res.payload.candles,
          stats: res.payload.stats,
          spotStats: res.payload.stats
            ? { ...s.spotStats, [focus]: res.payload.stats }
            : s.spotStats,
          pcr:
            res.payload.pcr !== null
              ? { ...s.pcr, [focus]: res.payload.pcr }
              : s.pcr,
          buildup:
            res.payload.buildup !== null
              ? { ...s.buildup, [focus]: res.payload.buildup }
              : s.buildup,
        }));
        nseSnapshotRef.current?.(focus, {
          underlying: focus,
          spot: res.payload.spot,
          timestamp: res.updatedAt,
          legs: res.payload.legs,
        });
        // Paints immediately either way — the difference is only whether the
        // pipeline below is trusted to stop there. A same-day row is; an
        // older one (a weekend/holiday gap, or just no tab open at the last
        // close) gets this as a fast first paint, then still lets candles,
        // the seed pass and the NSE chain snapshot below run and bring the
        // board current instead of freezing it on an old session.
        setReady(res.sessionDate === istDate() ? "hydrated" : "live");
      } catch {
        // No stored snapshot to fall back on either — the live pipeline
        // below is exactly what would have run without this effect.
        if (!cancelled) setReady("live");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, focus]);

  usePoll(
    enabled && !!spotToken && liveFetchGate,
    `candles:${focus}:${spotToken}:${isMarketOpen()}`,
    POLL_OPEN.candles,
    useCallback(async () => {
      if (!spotToken) return;
      setState((s) => ({ ...s, loading: true }));
      try {
        const res = await fetchCandles({
          exchange: INDEX_UNIVERSE[focus]?.exchange ?? "NSE",
          symboltoken: spotToken,
          interval: "ONE_MINUTE",
          ...sessionWindow(CANDLE_LOOKBACK_DAYS),
        });
        setState((s) => ({
          ...s,
          candles: res.session,
          stats: res.stats,
          spotStats: res.stats
            ? { ...s.spotStats, [focus]: res.stats }
            : s.spotStats,
          loading: false,
        }));
        ok();
      } catch (err) {
        setState((s) => ({ ...s, loading: false }));
        fail(err);
        // `usePoll` only stops rescheduling a closed-market cycle once it
        // *lands* — which it reads purely off whether this callback throws,
        // not off `fail()`. Catching and reporting without re-throwing (the
        // bug: confirmed live via Angel One historical timeouts) let a
        // failed fetch look "landed" and freeze the board on stale prices
        // with no further retry until focus happened to change.
        throw err;
      }
    }, [spotToken, focus, fail, ok]),
  );

  /* ------------------------------------------------ the other two indices */

  /**
   * The instruments the operator is not looking at.
   *
   * Only the focused index gets a trace and a ladder, but the header quotes all
   * three, and a ticker reading 0.00 is worse than no ticker. One candle
   * request each, on a slow loop, is enough to price them — and out of hours it
   * is the only thing that will.
   */
  const backgroundKey = Object.entries(spotTokens)
    .filter(([, token]) => token && token !== spotToken)
    .map(([u, token]) => `${u}:${token}`)
    .join(",");

  usePoll(
    enabled && !!backgroundKey,
    `spots:${backgroundKey}:${isMarketOpen()}`,
    POLL_OPEN.backgroundSpots,
    useCallback(async () => {
      // Fired together, not awaited one at a time — the shared client queue
      // in market/client.ts still paces the actual dispatch, so this only
      // drops the needless serial wait between four independent contracts.
      const pairs = backgroundKey
        .split(",")
        .filter(Boolean)
        .map((pair) => pair.split(":") as [string, string]);
      const results = await Promise.allSettled(
        pairs.map(([underlying, token]) =>
          fetchCandles(
            {
              exchange: INDEX_UNIVERSE[underlying]?.exchange ?? "NSE",
              symboltoken: token,
              interval: "ONE_MINUTE",
              ...sessionWindow(CANDLE_LOOKBACK_DAYS),
            },
            BACKGROUND_SPOT_TTL_MS,
          ),
        ),
      );
      const landed: Record<string, SessionStats> = {};
      let anyFailed = false;
      results.forEach((result, i) => {
        // A background quote is the most expendable thing here; the focused
        // instrument's own failures are what the error banner is for.
        if (result.status !== "fulfilled" || !result.value.stats) {
          anyFailed = true;
          return;
        }
        const [underlying] = pairs[i];
        landed[underlying] = result.value.stats;
      });
      if (Object.keys(landed).length) {
        setState((s) => ({ ...s, spotStats: { ...s.spotStats, ...landed } }));
      }
      // This callback used to resolve normally either way, "expendable"
      // meaning only "no error banner" — but `usePoll` reads that same
      // normal resolution as the cycle having *landed*, and stops
      // rescheduling once the market is closed. A background quote that
      // never landed then froze on whatever it last had (confirmed: Angel
      // One's historical endpoints timing out repeatedly against this exact
      // deployment) with no further retry until focus happened to change
      // and gave it a fresh key. Throwing keeps the slow closed-market
      // retry alive instead — still silent, just not permanent.
      if (anyFailed) throw new Error("background spot fetch incomplete");
    }, [backgroundKey]),
  );

  /* ------------------------------ session seeding: open interest and replay */

  const seedKey = seedTokens.join(",");

  /**
   * Everything the focused ladder needs from history, in one request per chunk.
   *
   * This used to be two calls per contract from the browser — 44 round trips
   * for a 22-strike ladder, each one's latency sitting in series with the rate
   * limiter, which is why the board filled a strike at a time. The batch route
   * takes the whole chunk and fans out server-side, next to the broker, so the
   * page waits on one request rather than forty-four.
   *
   * Chunks are fired together and land together. Every contract in a batch is
   * sliced to the same session, which is a correctness fix as much as a speed
   * one: asking each token for "its own last session" let an illiquid strike
   * answer with a different day from its neighbours, and put a stale premium in
   * the ladder next to live ones.
   *
   * The open-interest half runs whatever the hour — it is the COA 2.0 baseline.
   * The bars are only wanted when the market is shut; in session the feed is
   * the better source and stale bars would drag every rotation node backwards.
   */
  useEffect(() => {
    // While closed, this waits for the DB-hydration check above to resolve
    // rather than racing it — a hit means there is nothing left to seed.
    if (!enabled || !seedKey || !liveFetchGate) return;
    let cancelled = false;
    const date = sessionDate;
    const closed = !isMarketOpen();
    const wantBars = closed && benchmarkReady;

    const tokens = seedKey
      .split(",")
      .filter((t) => t && !(seenRef.current.has(`${date}:${t}`) && (!wantBars || replayedRef.current.has(`${date}:${t}`))));
    if (!tokens.length) return;

    // Chunked so one slow contract cannot hold the whole ladder, and so the
    // route stays inside its own per-request ceiling.
    const chunks: string[][] = [];
    for (let i = 0; i < tokens.length; i += BATCH_TOKENS) {
      chunks.push(tokens.slice(i, i + BATCH_TOKENS));
    }

    void (async () => {
      setState((s) => ({ ...s, seeding: true }));

      // Spot closes by bar time, so an option bar pairs with the index at the
      // same instant rather than by position — the two series skip different
      // minutes when a strike goes untraded.
      const benchmark = new Map(
        spotCandlesRef.current.map((c) => [c.time.slice(0, 16), c.close]),
      );

      await Promise.all(
        chunks.map(async (chunk) => {
          let res;
          try {
            res = await fetchBatch({
              date,
              tokens: chunk,
              oi: true,
              candles: wantBars,
              exchange: optionExchange(focus),
            });
          } catch (err) {
            if (!cancelled) fail(err);
            return;
          }
          if (cancelled) return;

          for (const contract of res.contracts) {
            const { token } = contract;

            if (contract.open_oi && contract.open_oi > 0) {
              seenRef.current.add(`${date}:${token}`);
              baselineRef.current(token, contract.open_oi, contract.last_oi ?? 0);
              // The series is kept, not just its ends: the wall migration is
              // reconstructed from these readings, at no extra request.
              if (contract.series?.length) {
                pendingSeriesRef.current[token] = contract.series;
              }
            }

            if (wantBars) {
              // Recorded either way: a strike that did not trade has no session
              // and should not be asked for again today.
              replayedRef.current.add(`${date}:${token}`);
              const bars = contract.bars ?? [];
              if (bars.length) {
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
              }
            }
          }

          flush();
          if (res.rate_limited) {
            fail(new Error("Broker throttled the history fetch — retrying shortly."));
          } else {
            ok();
          }
        }),
      );

      if (!cancelled) setState((s) => ({ ...s, seeding: false }));
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, seedKey, sessionDate, benchmarkReady, focus, liveFetchGate, flush, fail, ok]);

  /* ---------------------------------------------------------- wall curves */

  const wallKey = wallTokens.join(",");

  usePoll(
    enabled && wallTokens.length > 0,
    `walls:${wallKey}:${isMarketOpen()}`,
    POLL_OPEN.walls,
    useCallback(async () => {
      const date = sessionDate;
      const window = sessionWindow(0);
      const tokens = wallKey.split(",").filter(Boolean);
      // Aegis and Zenith are independent contracts — a throttle or a miss on
      // one must not cost the other its refresh too, which the old
      // stop-on-first-error loop did.
      const results = await Promise.allSettled(
        tokens.map((token) =>
          fetchOi({
            exchange: optionExchange(focus),
            symboltoken: token,
            interval: "FIFTEEN_MINUTE",
            fromdate: `${date} ${MARKET_OPEN_STAMP}`,
            // A closed session is finished, so its curve is asked for whole and
            // then cached; a live one is asked for up to the minute.
            todate: date === istDate() ? window.todate : `${date} 15:30`,
          }),
        ),
      );

      const seriesPatch: Record<string, OiPoint[]> = {};
      let newlyBaselined = false;
      let sawError: unknown;
      results.forEach((result, i) => {
        if (result.status !== "fulfilled") {
          sawError = result.reason;
          return;
        }
        const token = tokens[i];
        const res = result.value;
        if (!res.series.length) return;
        seriesPatch[token] = res.series;
        // The curve's first point is the same session-open reading the seed
        // pass looks for, so a wall inside the band is baselined for free.
        if (res.open_oi && res.open_oi > 0) {
          const key = `${date}:${token}`;
          if (!seenRef.current.has(key)) {
            seenRef.current.add(key);
            baselineRef.current(token, res.open_oi, res.last_oi ?? 0);
            newlyBaselined = true;
          }
        }
      });
      if (Object.keys(seriesPatch).length) {
        setState((s) => ({ ...s, oiSeries: { ...s.oiSeries, ...seriesPatch } }));
      }
      if (newlyBaselined) {
        setState((s) => ({ ...s, seeded: seenRef.current.size }));
      }
      // Same `usePoll` "landed" pitfall as the candles poll above: reporting
      // via `fail()` alone, without re-throwing, let a wall curve that
      // failed outright still count as a landed closed-market cycle and
      // freeze without retrying.
      if (sawError) {
        fail(sawError);
        throw sawError;
      }
      ok();
    }, [wallKey, sessionDate, focus, fail, ok]),
  );

  /* ------------------------------------- NSE option-chain snapshot (closed only) */

  /**
   * A second, wholly independent closed-market source: NSE's own
   * option-chain snapshot for the focused underlying, NSE-listed only.
   * Everything above this block — the Angel One seeding pass, the wall
   * curves, the closed-market replay it folds into — is untouched; this
   * effect only ever fires when the market is shut, and only calls a
   * callback the caller opted into. It fetches once per focus (the
   * snapshot will not change again until NSE's next session), not on a
   * poll, since there is nothing to keep re-reading. Waits on the same
   * DB-hydration gate as the Angel One seeding pass above — a hit there
   * means this has nothing to add either.
   */
  useEffect(() => {
    if (
      !enabled ||
      isMarketOpen() ||
      !liveFetchGate ||
      INDEX_UNIVERSE[focus]?.exchange !== "NSE"
    )
      return;
    const callback = nseSnapshotRef.current;
    if (!callback) return;

    let cancelled = false;
    void (async () => {
      try {
        const snapshot = await fetchNseOptionChain(focus);
        if (!cancelled) callback(focus, snapshot);
      } catch {
        // Best-effort only — Angel One's own closed-market replay above is
        // the primary source and needs nothing from this to keep working.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, focus, liveFetchGate]);

  /* -------------------------------------------------------------- pcr */

  usePoll(
    enabled,
    `pcr:${isMarketOpen()}`,
    POLL_OPEN.pcr,
    useCallback(async () => {
      try {
        const res = await fetchPcr();
        const today = istDate();
        const byUnderlying: Record<string, number> = {};
        for (const underlying of NSE_UNDERLYING_NAMES) {
          const row = pcrForUnderlying(res.rows, underlying, today);
          if (row) byUnderlying[underlying] = row.pcr;
        }
        setState((s) => ({ ...s, pcr: byUnderlying, pcrAt: res.fetched_at }));
        ok();
      } catch (err) {
        // Re-thrown for the same reason as the candles/walls polls above —
        // `usePoll` needs the throw itself to know a closed-market cycle
        // didn't actually land, or it stops retrying a failure entirely.
        fail(err);
        throw err;
      }
    }, [fail, ok]),
  );

  /* --------------------------------------------------------------- buildup */

  usePoll(
    enabled,
    `buildup:${isMarketOpen()}`,
    POLL_OPEN.buildup,
    useCallback(async () => {
      try {
        const results = await Promise.all(
          OI_BUILDUP_TYPES.map((datatype) => fetchBuildup(datatype, "NEAR")),
        );
        const next: Partial<Record<string, OiBuildupType>> = {};
        for (const underlying of NSE_UNDERLYING_NAMES) {
          for (let i = 0; i < OI_BUILDUP_TYPES.length; i++) {
            if (buildupIncludesUnderlying(results[i].rows, underlying)) {
              next[underlying] = OI_BUILDUP_TYPES[i];
              break;
            }
          }
        }
        setState((s) => ({ ...s, buildup: next }));
        ok();
      } catch (err) {
        // Same re-throw as the other closed-market polls in this file.
        fail(err);
        throw err;
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
