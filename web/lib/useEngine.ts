"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  Automation,
  EngineSnapshot,
  ExecutionMode,
  OptionChain,
  Position,
  RiskEvent,
  RrgNode,
  Signal,
  SpotQuote,
  Underlying,
  UserProfile,
} from "@/lib/types";
import {
  DEFAULT_CONFIG,
  EXCHANGE_NSE_CM,
  EXCHANGE_NSE_FO,
  INDEX_UNIVERSE,
  UNDERLYINGS,
  isMarketOpen,
  secondsToDaylightRest,
  secondsToNextOpen,
  type EngineConfig,
} from "@/lib/engine/config";
import { ChainBuilder } from "@/lib/engine/coa";
import { SignalEngine } from "@/lib/engine/dkms";
import { RrgEngine } from "@/lib/engine/rrg";
import { Ledger, applySlippage } from "@/lib/engine/ledger";
import { orderRow, positionRow, type OrderRow } from "@/lib/engine/persist";
import { ScripMaster, type MasterPayload } from "@/lib/engine/scripMaster";
import { planTick } from "@/lib/engine/loop";
import { runGuards } from "@/lib/engine/risk";
import { legRiskAtStop, portfolioRiskAtStop } from "@/lib/engine/sizing";
import { TickStore, type Tick } from "@/lib/stream/ticks";
import { SmartStreamClient, type StreamStatus } from "@/lib/stream/smartstream";
import { SimulatedFeed } from "@/lib/stream/simFeed";
import { useMarketData, type MarketData } from "@/lib/useMarketData";
import { clearMarketCache } from "@/lib/market/client";
import { api } from "@/lib/api";

/**
 * The DeltaK engine, running in the browser.
 *
 * This replaces `state.py`, `risk.py` and the SSE broadcaster in one hook: the
 * pipeline (feed → chain → RRG → protocol → signal → mark-to-market) runs on a
 * 1 Hz timer and produces the same `EngineSnapshot` the Python engine pushed, so
 * every HUD component renders unchanged.
 *
 * What genuinely differs from the server build: state lives in this tab. Refresh
 * and the RRG windows rebuild from scratch; close the tab and the circuit
 * breakers stop running. Positions are persisted to Supabase so the ledger
 * survives, but nothing guards them while the terminal is closed.
 */

const TICK_INTERVAL_MS = 1000;
const RESYNC_EVERY_TICKS = 30;
/**
 * How often open positions are checkpointed to Supabase.
 *
 * Entries and exits write immediately; this is what keeps the marks on a
 * *running* position from going stale in the table. A minute is the balance:
 * often enough that a tab closed mid-trade leaves a recent picture behind, rare
 * enough that a five-position book is one small write a minute.
 */
const CHECKPOINT_EVERY_TICKS = 60;
/** How often an open tab re-checks that its broker session is still alive. */
const SESSION_CHECK_MS = 15 * 60_000;
/** Focus fires on every alt-tab; do not spend a profile call on each one. */
const SESSION_FOCUS_MIN_MS = 5 * 60_000;

export interface EngineSession {
  authenticated: boolean;
  clientCode: string | null;
  feedToken: string | null;
  apiKey: string | null;
  loginTime: string | null;
  /** Who is signed in. Null while a profile read is failing, never a blocker. */
  profile: UserProfile | null;
}

const NO_SESSION: EngineSession = {
  authenticated: false,
  clientCode: null,
  feedToken: null,
  apiKey: null,
  loginTime: null,
  profile: null,
};

/*
 * Persistence is fire-and-forget in both directions: nothing awaits it, and
 * nothing surfaces its failures to the operator mid-trade. What it must not do
 * is fail *silently and permanently*, which is what happened while engine
 * objects were being posted as table rows — hence the mappers.
 */

const savePositions = (positions: Position[]) => {
  if (!positions.length) return;
  void api.persist("positions", positions.map(positionRow)).catch(() => undefined);
};

const saveOrder = (row: OrderRow) => {
  void api.persist("orders", [row]).catch(() => undefined);
};

export type StreamState = StreamStatus;

export function useEngine(simulate: boolean) {
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);
  const [session, setSession] = useState<EngineSession>(NO_SESSION);
  const [mode, setMode] = useState<ExecutionMode>("paper");
  /**
   * Who fires an actionable signal — the browser's own Autopilot, or the
   * operator clicking Execute. Local, UI-only state: unlike `mode` this never
   * touches the broker, so switching it is instant and never rejected.
   */
  const [automation, setAutomationState] = useState<Automation>("manual");
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle");
  const [masterReady, setMasterReady] = useState(false);
  /**
   * Whether the initial session restore has *settled* — not whether it
   * succeeded. Before this, "not authenticated" and "haven't checked yet"
   * were the same `false`, which is what put the sign-in screen on a fully
   * signed-in operator's tab for one frame on every reload: the page rendered
   * "not authenticated" as fact before the restore call had even returned.
   */
  const [sessionChecked, setSessionChecked] = useState(false);
  const [simulated, setSimulated] = useState(false);
  const [demo, setDemo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * The instrument the HUD is showing. It lives here rather than in the page
   * because the historical fetches are scoped to it — one underlying's intraday
   * detail at a time is what keeps the metered endpoints inside their limits.
   */
  const [focus, setFocus] = useState<Underlying>("NIFTY");

  // Engine internals live in refs so the 1 Hz loop never re-creates them.
  const cfgRef = useRef<EngineConfig>({ ...DEFAULT_CONFIG });
  const ticksRef = useRef(new TickStore());
  const masterRef = useRef(new ScripMaster());
  const rrgRef = useRef<Record<string, RrgEngine>>({});
  const buildersRef = useRef<Record<string, ChainBuilder>>({});
  const signalEnginesRef = useRef<Record<string, SignalEngine>>({});
  const ledgerRef = useRef(
    new Ledger(
      DEFAULT_CONFIG.paperCapital,
      DEFAULT_CONFIG.slippagePct,
      DEFAULT_CONFIG.costPerOrder,
    ),
  );
  const chainsRef = useRef<Record<string, OptionChain>>({});
  const signalsRef = useRef<Record<string, Signal>>({});
  /**
   * `market` (from `useMarketData`, declared later in this hook) as a ref, so
   * the 1 Hz `tick()` closure below — memoized once, deliberately independent
   * of every reactive value — can still read the latest cumulative PCR and OI
   * buildup class at call time without being torn down and rebuilt on every
   * poll.
   */
  const marketRef = useRef<MarketData | null>(null);
  const eventsRef = useRef<RiskEvent[]>([]);
  const scaledRef = useRef(new Set<string>());
  const daylightDoneRef = useRef(false);
  const resyncRef = useRef(0);
  const checkpointRef = useRef(CHECKPOINT_EVERY_TICKS);
  /** Seeded-quote count at the last rebuild — the "has anything changed" flag. */
  const lastSeedRef = useRef(-1);
  /** Print count at the last rebuild: the only proof the feed is delivering. */
  const lastPrintsRef = useRef(-1);
  /** True while the board is frozen on a finished session. */
  const settledRef = useRef(false);
  const modeRef = useRef<ExecutionMode>("paper");
  const sessionRef = useRef<EngineSession>(NO_SESSION);
  const busyRef = useRef(false);

  const streamRef = useRef<SmartStreamClient | null>(null);
  const simRef = useRef<SimulatedFeed | null>(null);
  // The simulated feed is opt-in: an unauthenticated visitor sees the sign-in
  // screen, not a terminal quietly filled with synthetic prints.
  const demoRef = useRef(false);

  modeRef.current = mode;
  sessionRef.current = session;

  /* ------------------------------------------------------------- events */

  const log = useCallback(
    (kind: RiskEvent["kind"], message: string, underlying?: string) => {
      const event: RiskEvent = {
        ts: new Date().toISOString().slice(0, 19),
        kind,
        underlying: underlying ?? null,
        message,
      };
      eventsRef.current = [event, ...eventsRef.current].slice(0, 100);
      void api.persist("events", [event]).catch(() => undefined);
    },
    [],
  );

  const spotMap = useCallback((): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const u of UNDERLYINGS) {
      out[u] = ticksRef.current.ltp(masterRef.current.spotToken(u));
    }
    return out;
  }, []);

  /* -------------------------------------------------------------- feeds */

  const stopFeeds = useCallback(() => {
    streamRef.current?.stop();
    simRef.current?.stop();
    setSimulated(false);
  }, []);

  const startFeed = useCallback(
    (sess: EngineSession) => {
      stopFeeds();
      const onTick = (t: Tick) => ticksRef.current.apply(t);

      if (sess.authenticated && sess.feedToken && sess.clientCode && sess.apiKey) {
        const client = new SmartStreamClient(onTick, setStreamStatus);
        streamRef.current = client;
        const { spotTokens, optionTokens } = masterRef.current.subscriptionTokens(
          spotMap(),
          cfgRef.current.chainDepth,
        );
        client.track(EXCHANGE_NSE_CM, spotTokens);
        client.track(EXCHANGE_NSE_FO, optionTokens);
        client.start({
          clientCode: sess.clientCode,
          feedToken: sess.feedToken,
          apiKey: sess.apiKey,
        });
        log("INFO", "SmartStream 2.0 feed engaged (mode 3 snap quote).");
      } else if (simulate && demoRef.current) {
        const sim = new SimulatedFeed(onTick);
        simRef.current = sim;
        sim.start(masterRef.current, TICK_INTERVAL_MS);
        setSimulated(true);
        setStreamStatus("live");
        log("INFO", "Simulated feed engaged — prints are synthetic.");
      } else {
        setStreamStatus("idle");
      }
    },
    [simulate, spotMap, stopFeeds, log],
  );

  /* ---------------------------------------------------------- execution */

  const bookExit = useCallback(
    async (pos: Position, reason: string) => {
      const exitSide = pos.side === "BUY" ? "SELL" : "BUY";
      const ltp = ticksRef.current.ltp(pos.token, pos.ltp || pos.avg_price);

      let brokerOrderId: string | null = null;

      if (pos.mode === "live" && sessionRef.current.authenticated) {
        try {
          const res = await api.placeOrder({
            trading_symbol: pos.trading_symbol,
            symbol_token: pos.token,
            transaction_type: exitSide,
            quantity: pos.quantity,
            order_type: "MARKET",
          });
          brokerOrderId = res.order_id ?? null;
        } catch (err) {
          const detail = err instanceof Error ? err.message : "unknown";
          // A rejected exit leaves a live position the book thinks it wanted
          // closed. That divergence is the single most important thing in the
          // record, so it is written even though nothing was filled.
          saveOrder(
            orderRow({
              position: pos,
              transactionType: exitSide,
              quantity: pos.quantity,
              lots: pos.lots,
              status: "REJECTED",
              message: `${reason}: ${detail}`,
            }),
          );
          log("INFO", `Exit order rejected: ${detail}`, pos.underlying);
          return;
        }
      }

      const fill =
        pos.mode === "live"
          ? ltp
          : applySlippage(ltp, exitSide, cfgRef.current.slippagePct);
      const closed = ledgerRef.current.close(pos.id, fill, reason);
      if (closed) {
        savePositions([closed]);
        saveOrder(
          orderRow({
            position: closed,
            transactionType: exitSide,
            quantity: closed.quantity,
            lots: closed.lots,
            fillPrice: fill,
            status: "ACCEPTED",
            brokerOrderId,
            message: reason,
          }),
        );
        log(
          "INFO",
          `EXIT [${reason}] ${closed.trading_symbol} @ ${fill.toFixed(2)} → PnL ₹${closed.realised_pnl.toLocaleString("en-IN")}`,
          closed.underlying,
        );
      }
    },
    [log],
  );

  const bookScaleOut = useCallback(
    async (pos: Position, fraction: number) => {
      const lots = Math.max(1, Math.floor(pos.lots * fraction));
      if (lots >= pos.lots) {
        await bookExit(pos, "TP1");
        return;
      }

      const exitSide = pos.side === "BUY" ? "SELL" : "BUY";
      const ltp = ticksRef.current.ltp(pos.token, pos.ltp || pos.avg_price);
      const quantity = lots * pos.lot_size;
      let brokerOrderId: string | null = null;

      if (pos.mode === "live" && sessionRef.current.authenticated) {
        try {
          const res = await api.placeOrder({
            trading_symbol: pos.trading_symbol,
            symbol_token: pos.token,
            transaction_type: exitSide,
            quantity,
            order_type: "MARKET",
          });
          brokerOrderId = res.order_id ?? null;
        } catch (err) {
          saveOrder(
            orderRow({
              position: pos,
              transactionType: exitSide,
              quantity,
              lots,
              status: "REJECTED",
              message: `TP1: ${err instanceof Error ? err.message : "unknown"}`,
            }),
          );
          return;
        }
      }

      const fill =
        pos.mode === "live"
          ? ltp
          : applySlippage(ltp, exitSide, cfgRef.current.slippagePct);
      const residual = ledgerRef.current.reduce(pos.id, lots, fill, "TP1");
      if (residual) savePositions([residual]);
      saveOrder(
        orderRow({
          position: pos,
          transactionType: exitSide,
          quantity,
          lots,
          fillPrice: fill,
          status: "ACCEPTED",
          brokerOrderId,
          message: "TP1",
        }),
      );
      log(
        "TARGET",
        `TP1 scale-out ${lots} lot(s) of ${pos.trading_symbol} @ ${fill.toFixed(2)}`,
        pos.underlying,
      );
    },
    [bookExit, log],
  );

  /* ---------------------------------------------------------- snapshot */

  const feedLive = useCallback(
    () => streamRef.current?.status === "live" || !!simRef.current?.running,
    [],
  );

  const buildSnapshot = useCallback((): EngineSnapshot => {
    const cfg = cfgRef.current;
    const ticks = ticksRef.current;
    const master = masterRef.current;

    const spots: Record<string, SpotQuote> = {};
    for (const [u, spec] of Object.entries(INDEX_UNIVERSE)) {
      const token = master.spotToken(u);
      const ltp = ticks.ltp(token);
      const prev = ticks.prevLtp(token);
      const close = ticks.get(token)?.close ?? 0;
      spots[u] = {
        underlying: u,
        label: spec.label,
        token: token || null,
        ltp: Number(ltp.toFixed(2)),
        prev: Number(prev.toFixed(2)),
        direction: prev === 0 || ltp === prev ? 0 : ltp > prev ? 1 : -1,
        change: close ? Number((ltp - close).toFixed(2)) : 0,
        change_pct: close ? Number((((ltp - close) / close) * 100).toFixed(2)) : 0,
      };
    }

    const rrgNodes: Record<string, RrgNode[]> = {};
    for (const u of UNDERLYINGS) {
      const chain = chainsRef.current[u];
      const engine = rrgRef.current[u];
      const nodes: RrgNode[] = [];
      if (chain && engine) {
        const span = INDEX_UNIVERSE[u].strikeStep * cfg.rrgNodeSpan;
        for (const row of chain.rows) {
          if (chain.atm_strike && Math.abs(row.strike - chain.atm_strike) > span) continue;
          const legs = [
            [row.call, "CE"] as const,
            [row.put, "PE"] as const,
          ];
          for (const [leg, type] of legs) {
            if (!leg || leg.rs_ratio === null || !leg.quadrant) continue;
            if (leg.ltp <= 0 || !engine.matured(leg.token)) continue;
            nodes.push({
              token: leg.token,
              label: `${Math.round(row.strike)}${type}`,
              strike: row.strike,
              option_type: type,
              rs_ratio: leg.rs_ratio,
              rs_momentum: leg.rs_momentum ?? 100,
              quadrant: leg.quadrant,
              tail: engine.tail(leg.token),
            });
          }
        }
      }
      rrgNodes[u] = nodes;
    }

    return {
      ts: new Date().toISOString().slice(0, 19),
      mode: modeRef.current,
      authenticated: sessionRef.current.authenticated,
      feed_connected: feedLive(),
      market_open: isMarketOpen(),
      seconds_to_daylight_rest: secondsToDaylightRest(),
      seconds_to_open: secondsToNextOpen(),
      spots,
      chains: { ...chainsRef.current },
      rrg: rrgNodes,
      signals: { ...signalsRef.current },
      ledger: ledgerRef.current.snapshot(modeRef.current),
      events: eventsRef.current.slice(0, 20),
    };
  }, [feedLive]);

  /* -------------------------------------------------------------- loop */

  const tick = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const ledger = ledgerRef.current;
      const master = masterRef.current;
      ledger.markToMarket(ticksRef.current);

      const cap = ledger.equity;
      const free = Math.max(0, cap - ledger.deployed);

      /**
       * Out of hours the board is settled, not running. `planTick` owns the
       * rules and states why; the loop just obeys them.
       */
      const printsNow = ticksRef.current.updates;
      const seededNow = ticksRef.current.seeded;
      const plan = planTick({
        marketOpen: isMarketOpen(),
        simulated: !!simRef.current?.running,
        printsChanged: printsNow !== lastPrintsRef.current,
        seedsChanged: seededNow !== lastSeedRef.current,
        hasChains: Object.keys(chainsRef.current).length > 0,
      });
      lastPrintsRef.current = printsNow;
      lastSeedRef.current = seededNow;
      settledRef.current = plan.settled;

      if (plan.rebuild) {
        for (const u of UNDERLYINGS) {
          const builder = buildersRef.current[u];
          const engine = signalEnginesRef.current[u];
          if (!builder || !engine) continue;
          const spot = ticksRef.current.ltp(master.spotToken(u));
          // Rotation advances on real prints in a live session, and on nothing
          // else — a replayed session must survive the loop that follows it.
          const chain = builder.build(master, ticksRef.current, spot, plan.advance);
          chainsRef.current[u] = chain;
          signalsRef.current[u] = engine.evaluate(chain, master, cap, free, {
            marketPcr: marketRef.current?.pcr[u] ?? null,
            buildupClass: marketRef.current?.buildup[u] ?? null,
          });
        }
      }

      if (plan.guards) {
        await runGuards({
          ledger,
          chains: chainsRef.current,
          rrg: rrgRef.current,
          cfg: cfgRef.current,
          ltp: (token) => ticksRef.current.ltp(token),
          exit: bookExit,
          scaleOut: bookScaleOut,
          log,
          scaled: scaledRef.current,
          daylightRestDone: daylightDoneRef.current,
          onDaylightRestDone: () => {
            daylightDoneRef.current = true;
          },
        });
      }

      /*
       * Checkpoint the open book.
       *
       * Entries and exits are written the moment they happen, which covers the
       * two ends of a trade but not the middle: a tab closed while three
       * positions are running would otherwise leave them stored at their entry
       * marks forever. This keeps the live P&L, last price and any moved stop
       * current, and upserts on the trade key so it stays one row per trade.
       */
      checkpointRef.current -= 1;
      if (checkpointRef.current <= 0) {
        checkpointRef.current = CHECKPOINT_EVERY_TICKS;
        // Nothing moves out of hours, so a settled board has nothing to say.
        if (!settledRef.current) savePositions(ledger.openPositions);
      }

      // Re-subscribe strikes that drifted into range as spot moved.
      resyncRef.current -= 1;
      if (resyncRef.current <= 0) {
        resyncRef.current = RESYNC_EVERY_TICKS;
        const client = streamRef.current;
        if (client && client.status === "live") {
          const { spotTokens, optionTokens } = master.subscriptionTokens(
            spotMap(),
            cfgRef.current.chainDepth,
          );
          client.subscribeNew(EXCHANGE_NSE_CM, spotTokens);
          client.subscribeNew(EXCHANGE_NSE_FO, optionTokens);
        }
      }

      setSnapshot(buildSnapshot());
    } finally {
      busyRef.current = false;
    }
  }, [bookExit, bookScaleOut, buildSnapshot, log, spotMap]);

  /* --------------------------------------------------------- lifecycle */

  const loadMaster = useCallback(async () => {
    try {
      const payload = (await api.master()) as MasterPayload;
      masterRef.current = new ScripMaster(payload);
      setMasterReady(masterRef.current.ready);
      setError(null);
      log(
        "INFO",
        `Scrip master loaded — ${payload.totalRecords.toLocaleString("en-IN")} records projected.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scrip master fetch failed";
      setError(message);
      log("INFO", `Scrip master unavailable: ${message}`);
    }
    return masterRef.current;
  }, [log]);

  useEffect(() => {
    const cfg = cfgRef.current;
    for (const u of UNDERLYINGS) {
      const rrg = new RrgEngine(cfg.rrgWindow, cfg.rrgMomentumLookback, cfg.rrgTailLength);
      const builder = new ChainBuilder(u, rrg, cfg);
      rrgRef.current[u] = rrg;
      buildersRef.current[u] = builder;
      signalEnginesRef.current[u] = new SignalEngine(u, builder, cfg);
    }

    let cancelled = false;
    void (async () => {
      // Both before the feed: the master supplies the tokens to subscribe to,
      // and the session supplies the credentials to subscribe with.
      const [restored] = await Promise.all([restoreSession(), loadMaster()]);
      if (cancelled) return;
      startFeed(restored.authenticated ? restored : sessionRef.current);
      // Both calls catch their own errors internally, so this always settles —
      // "checked" is never stuck behind a network failure the way a gate on
      // `masterReady` alone would be.
      setSessionChecked(true);
      void tick();
    })();

    const id = setInterval(() => void tick(), TICK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      stopFeeds();
    };
    // Engine bootstraps once for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* -------------------------------------------------- historical context */

  const focusChain = snapshot?.chains[focus];

  /** Every index's spot token — the header quotes all three. */
  const spotTokens = useMemo(
    () =>
      Object.fromEntries(
        UNDERLYINGS.map((u) => [u, masterRef.current.spotToken(u)]),
      ) as Record<string, string>,
    // The master is a ref; `masterReady` is the state edge that says it landed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [masterReady],
  );

  const spotToken = useMemo(
    () => masterRef.current.spotToken(focus),
    // The master is a ref; `masterReady` is the state edge that says it landed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focus, masterReady],
  );

  /**
   * Contracts to baseline, nearest the money first. Order matters: the seed
   * pass stops on the first rate-limit, and if it only ever gets part of the
   * way through, the strikes it did reach should be the ones the walls and the
   * driver actually sit on.
   */
  const seedTokens = useMemo(() => {
    const atm = focusChain?.atm_strike ?? 0;
    if (!focusChain || !atm) return [];
    const span = INDEX_UNIVERSE[focus].strikeStep * cfgRef.current.oiSeedSpan;
    return focusChain.rows
      .filter((r) => Math.abs(r.strike - atm) <= span)
      .sort((a, b) => Math.abs(a.strike - atm) - Math.abs(b.strike - atm))
      .flatMap((r) => [r.call?.token, r.put?.token])
      .filter((t): t is string => !!t);
  }, [focusChain, focus]);

  /** The put defending Aegis and the call capping Zenith. */
  const wallTokens = useMemo(() => {
    if (!focusChain) return [];
    const { aegis_1: aegis, zenith_1: zenith } = focusChain.levels;
    const at = (strike: number | null) =>
      strike === null ? undefined : focusChain.rows.find((r) => r.strike === strike);
    return [at(aegis)?.put?.token, at(zenith)?.call?.token].filter(
      (t): t is string => !!t,
    );
  }, [focusChain]);

  const onOiBaseline = useCallback((token: string, openOi: number, lastOi: number) => {
    ticksRef.current.seedSessionOpenOi(token, openOi);
    // With the market shut the feed will never send an OI frame, so the closing
    // reading stands in. In session the feed is authoritative and this would be
    // a stale number fighting a live one.
    if (!isMarketOpen() && lastOi > 0) {
      ticksRef.current.seedQuote(token, { oi: lastOi });
    }
  }, []);

  /**
   * Replay a contract's last session into its rotation window.
   *
   * The RRG is a series, not a snapshot: with no feed it has nothing to rotate,
   * and every node sits at the origin however long you leave the terminal open.
   * Feeding it the session's bars gives it exactly what the feed would have —
   * premium against spot, in order — and the closing premium doubles as the
   * ladder's last price so the chain reads as Friday's close rather than dashes.
   */
  const onContractSession = useCallback(
    (
      token: string,
      replay: { pairs: [number, number][]; lastClose: number; volume: number },
    ) => {
      const underlying = masterRef.current.instrument(token)?.name;
      const rrg = underlying ? rrgRef.current[underlying] : undefined;
      if (rrg) {
        for (const [premium, spot] of replay.pairs) rrg.update(token, premium, spot);
      }
      ticksRef.current.seedQuote(token, {
        ltp: replay.lastClose,
        volume: replay.volume,
      });
    },
    [],
  );

  const market = useMarketData({
    enabled: session.authenticated,
    focus,
    spotToken,
    spotTokens,
    seedTokens,
    wallTokens,
    onOiBaseline,
    onContractSession,
  });
  marketRef.current = market;

  /**
   * The index itself, out of hours.
   *
   * Nothing else can be built without it: a spot of zero means no ATM strike,
   * no chain, and therefore no rotation nodes to draw whatever the replay
   * loaded. The candle session carries both the close and the one before it, so
   * the change on the day survives the market being shut.
   */
  const spotStats = market.spotStats;
  useEffect(() => {
    if (isMarketOpen()) return;
    for (const [underlying, stats] of Object.entries(spotStats)) {
      const token = spotTokens[underlying];
      if (!token || !stats || stats.close <= 0) continue;
      ticksRef.current.seedQuote(token, {
        ltp: stats.close,
        close: stats.prev_close ?? 0,
      });
    }
  }, [spotStats, spotTokens]);

  // One line in the log when the baselines land, not one per contract.
  const seedingRef = useRef(false);
  useEffect(() => {
    if (seedingRef.current && !market.seeding && market.seeded > 0) {
      log(
        "INFO",
        `COA 2.0 baselines seeded from historical OI — ${market.seeded} contract(s).`,
      );
    }
    seedingRef.current = market.seeding;
  }, [market.seeding, market.seeded, log]);

  /* ------------------------------------------------------------ actions */

  const login = useCallback(
    async (payload: {
      client_code: string;
      pin: string;
      totp: string;
      turnstile_token?: string;
    }) => {
      const res = await api.login(payload);
      const next: EngineSession = {
        authenticated: true,
        clientCode: res.client_code,
        feedToken: res.feed_token,
        apiKey: res.api_key,
        loginTime: res.login_time,
        profile: res.profile ?? null,
      };
      setSession(next);
      sessionRef.current = next;
      // Anything cached from a previous session belonged to a different JWT.
      clearMarketCache();
      log(
        "INFO",
        `SmartAPI session established for ${res.profile?.name ?? res.client_code}.`,
      );
      startFeed(next);
      return res;
    },
    [log, startFeed],
  );

  /**
   * Rebuild the session from the cookie on load.
   *
   * The JWT has always outlived the page; the *state* describing it did not, so
   * a refresh dropped the operator at the sign-in screen with a perfectly good
   * session sitting in the cookie jar. The route revalidates against the broker
   * and refreshes across the daily expiry, so what comes back is a session that
   * actually works, or nothing.
   */
  const restoreSession = useCallback(async (): Promise<EngineSession> => {
    try {
      const res = await api.session();
      if (!res.authenticated || !res.client_code) return NO_SESSION;
      const next: EngineSession = {
        authenticated: true,
        clientCode: res.client_code,
        feedToken: res.feed_token ?? null,
        apiKey: res.api_key ?? null,
        loginTime: res.login_time ?? null,
        profile: res.profile ?? null,
      };
      setSession(next);
      sessionRef.current = next;
      const who = res.profile?.name ?? res.client_code;
      log(
        "INFO",
        res.refreshed
          ? `SmartAPI session refreshed for ${who} — tokens renewed past expiry.`
          : `SmartAPI session restored for ${who}.`,
      );
      return next;
    } catch {
      return NO_SESSION;
    }
  }, [log]);

  /**
   * Re-read the operator's profile from the broker.
   *
   * The HUD already has one from login or restore; this is for the refresh
   * asked for by hand, after enabling a segment with the broker and wanting the
   * terminal to agree. Failures are returned as null rather than thrown — the
   * profile already on screen stays on screen.
   */
  const refreshProfile = useCallback(async (): Promise<UserProfile | null> => {
    try {
      const { profile } = await api.profile();
      if (!profile) return null;
      const next = { ...sessionRef.current, profile };
      setSession(next);
      sessionRef.current = next;
      return profile;
    } catch {
      return null;
    }
  }, []);

  /** Adopt a profile the caller already has — e.g. just back from a contact edit. */
  const setProfile = useCallback((profile: UserProfile) => {
    const next = { ...sessionRef.current, profile };
    setSession(next);
    sessionRef.current = next;
  }, []);

  const enterDemo = useCallback(() => {
    demoRef.current = true;
    setDemo(true);
    startFeed(sessionRef.current);
    log("INFO", "Demo mode — synthetic prints, no broker connection.");
  }, [startFeed, log]);

  const logout = useCallback(async () => {
    await api.logout().catch(() => undefined);
    clearMarketCache();
    demoRef.current = false;
    setDemo(false);
    setSession(NO_SESSION);
    sessionRef.current = NO_SESSION;
    setMode("paper");
    modeRef.current = "paper";
    log("INFO", "SmartAPI session terminated.");
    startFeed(NO_SESSION);
  }, [log, startFeed]);

  /**
   * Keep the session honest while the tab is open.
   *
   * SmartAPI tokens die daily, and a terminal left open across the rollover
   * would otherwise sit there looking connected while every call quietly
   * failed. Re-checking on a timer — and when the tab is focused, which is what
   * actually happens after a night away — either renews it from the refresh
   * token or signs out cleanly and says so.
   */
  useEffect(() => {
    if (!session.authenticated) return;
    let cancelled = false;
    let lastCheck = Date.now();

    const check = async () => {
      lastCheck = Date.now();
      let res;
      try {
        res = await api.session();
      } catch {
        return; // A transient failure is not an expiry.
      }
      if (cancelled) return;

      if (!res.authenticated) {
        stopFeeds();
        clearMarketCache();
        setSession(NO_SESSION);
        sessionRef.current = NO_SESSION;
        setMode("paper");
        modeRef.current = "paper";
        log("INFO", "SmartAPI session expired — sign in again to resume the feed.");
        return;
      }

      // A refresh mints a new feed token, and the old socket is authenticated
      // with the old one: reconnect rather than let it die quietly.
      if (res.refreshed && res.client_code) {
        const next: EngineSession = {
          authenticated: true,
          clientCode: res.client_code,
          feedToken: res.feed_token ?? null,
          apiKey: res.api_key ?? null,
          loginTime: res.login_time ?? null,
          profile: res.profile ?? sessionRef.current.profile,
        };
        setSession(next);
        sessionRef.current = next;
        clearMarketCache();
        startFeed(next);
        log("INFO", "SmartAPI tokens renewed — feed reconnected.");
      }
    };

    const onFocus = () => {
      if (Date.now() - lastCheck >= SESSION_FOCUS_MIN_MS) void check();
    };

    const id = setInterval(() => void check(), SESSION_CHECK_MS);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [session.authenticated, startFeed, stopFeeds, log]);

  const switchMode = useCallback(
    (next: ExecutionMode) => {
      if (next === "live") {
        if (!sessionRef.current.authenticated) {
          throw new Error("Live mode requires a SmartAPI session.");
        }
        if (!ticksRef.current.updates) {
          throw new Error("Refusing Live mode without a live market feed.");
        }
      }
      setMode(next);
      modeRef.current = next;
      log("INFO", `Execution mode switched to ${next.toUpperCase()}.`);
    },
    [log],
  );

  const setAutomation = useCallback(
    (next: Automation) => {
      setAutomationState(next);
      log("INFO", `${next === "auto" ? "Autopilot engaged — actionable signals execute themselves." : "Manual control — signals wait for Execute."}`);
    },
    [log],
  );

  const executeSignal = useCallback(
    async (underlying: string, lots?: number) => {
      const signal = signalsRef.current[underlying];
      if (!signal?.token || !signal.trading_symbol || !signal.sizing) {
        throw new Error("Signal has no executable node.");
      }
      const useLots = lots ?? signal.sizing.lots;
      if (useLots <= 0) throw new Error("Sizing resolved to zero lots.");

      const ledger = ledgerRef.current;
      const openCount = ledger.openPositions.length;
      if (openCount >= cfgRef.current.maxConcurrentPositions) {
        throw new Error(
          `Order rejected: ${openCount} open positions already at the ${cfgRef.current.maxConcurrentPositions}-position ceiling.`,
        );
      }

      const reference = ticksRef.current.ltp(signal.token, signal.entry_price ?? 0);
      if (reference <= 0) throw new Error("Order rejected: no live price for this contract.");

      const lotSize = signal.sizing.lot_size;
      const quantity = useLots * lotSize;

      /**
       * Portfolio-level at-risk ceiling.
       *
       * `maxConcurrentPositions` bounds how many trades can be open; it says
       * nothing about whether they are the same bet. Three separately-sized,
       * separately-stopped longs across NIFTY/BANKNIFTY/FINNIFTY can all
       * breach in the same macro move, and the book's real loss is the sum of
       * their stops — one correlated bet wearing three position slots. This
       * bounds the total loss-at-stop the book can carry at once, directly,
       * without needing to model the correlation itself.
       */
      const openRisk = portfolioRiskAtStop(ledger.openPositions);
      const candidateRisk = legRiskAtStop({
        side: "BUY",
        avg_price: reference,
        stop_loss: signal.stop_loss,
        quantity,
      });
      const riskCeiling = ledger.equity * (cfgRef.current.maxPortfolioRiskPct / 100);
      if (openRisk + candidateRisk > riskCeiling) {
        throw new Error(
          `Order rejected: portfolio at-risk ₹${Math.round(openRisk + candidateRisk).toLocaleString("en-IN")} ` +
            `would exceed the ${cfgRef.current.maxPortfolioRiskPct}% ceiling ` +
            `(₹${Math.round(riskCeiling).toLocaleString("en-IN")}) across ${openCount} open position(s).`,
        );
      }

      const currentMode = modeRef.current;

      let fill = reference;
      let brokerOrderId: string | null = null;

      if (currentMode === "live") {
        const res = await api.placeOrder({
          trading_symbol: signal.trading_symbol,
          symbol_token: signal.token,
          transaction_type: "BUY",
          quantity,
          order_type: "MARKET",
        });
        brokerOrderId = res.order_id ?? null;
      } else {
        fill = applySlippage(reference, "BUY", cfgRef.current.slippagePct);
      }

      const pos = ledger.open({
        underlying,
        token: signal.token,
        tradingSymbol: signal.trading_symbol,
        quantity,
        lots: useLots,
        lotSize,
        price: fill,
        optionType: signal.option_type,
        strike: signal.strike,
        stopLoss: signal.stop_loss,
        target: signal.target_1,
        protocol: signal.protocol,
        entrySpot: chainsRef.current[underlying]?.spot ?? null,
        mode: currentMode,
      });

      savePositions([pos]);
      saveOrder(
        orderRow({
          position: pos,
          transactionType: "BUY",
          quantity,
          lots: useLots,
          fillPrice: fill,
          status: "ACCEPTED",
          brokerOrderId,
          message: `ENTRY ${signal.protocol}`,
        }),
      );
      log(
        "INFO",
        `${currentMode.toUpperCase()} BUY ${useLots}×${lotSize} ${signal.trading_symbol} @ ${fill.toFixed(2)}` +
          (brokerOrderId ? ` — order ${brokerOrderId}` : ""),
        underlying,
      );
      // A fill taken against a settled board is real in the ledger and frozen
      // on the screen until the feed returns. Saying so beats an operator
      // reading a motionless P&L as a motionless market.
      if (!isMarketOpen()) {
        log(
          "INFO",
          `Booked against the last close — ${signal.trading_symbol} marks from the next print.`,
          underlying,
        );
      }

      return {
        ok: true,
        message:
          currentMode === "live"
            ? `Order ${brokerOrderId} accepted by NSE for ${quantity} qty.`
            : `Simulated fill ${useLots} lot(s) @ ₹${fill.toLocaleString("en-IN")} (slippage applied).`,
      };
    },
    [log],
  );

  /**
   * Autopilot. When `automation` is `"auto"`, an actionable signal
   * fires itself exactly the way a manual Execute click does — same sizing,
   * same portfolio-risk gate, same everything in `executeSignal` above.
   *
   * The only thing added here is the guard against re-firing: once a
   * position is open on a signal's token, it's skipped on every later tick,
   * so a signal that stays actionable for minutes opens exactly one
   * position, not one a second. Nothing fires against a settled board — out
   * of hours (and not simulated) there is no live price to fill against.
   */
  const autoInFlightRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (automation !== "auto" || !snapshot) return;
    if (!snapshot.market_open && !simulated) return;

    for (const u of UNDERLYINGS) {
      const signal = snapshot.signals[u];
      if (!signal?.actionable || !signal.token) continue;
      if (autoInFlightRef.current.has(u)) continue;
      if (snapshot.ledger.open_positions.some((p) => p.token === signal.token)) continue;

      autoInFlightRef.current.add(u);
      void executeSignal(u)
        .catch((err) => {
          log(
            "INFO",
            `Autopilot entry held back: ${err instanceof Error ? err.message : "unknown error"}`,
            u,
          );
        })
        .finally(() => {
          autoInFlightRef.current.delete(u);
        });
    }
  }, [snapshot, automation, simulated, executeSignal, log]);

  const exitPosition = useCallback(
    async (positionId: string, reason = "MANUAL") => {
      const pos = ledgerRef.current.get(positionId);
      if (!pos) throw new Error("Unknown position id.");
      await bookExit(pos, reason);
    },
    [bookExit],
  );

  const scaleOutPosition = useCallback(
    async (positionId: string, fraction = 0.5) => {
      const pos = ledgerRef.current.get(positionId);
      if (!pos) throw new Error("Unknown position id.");
      await bookScaleOut(pos, fraction);
    },
    [bookScaleOut],
  );

  const panicFlatten = useCallback(async () => {
    const open = ledgerRef.current.openPositions;
    for (const pos of open) await bookExit(pos, "PANIC");
    if (open.length) log("PANIC", `Flatten [PANIC] executed across ${open.length} position(s).`);
  }, [bookExit, log]);

  const resetPaper = useCallback(() => {
    ledgerRef.current.reset();
    scaledRef.current.clear();
    log("INFO", "Paper ledger reset to starting capital.");
  }, [log]);

  return {
    snapshot,
    session,
    sessionChecked,
    mode,
    automation,
    setAutomation,
    streamStatus,
    masterReady,
    simulated,
    demo,
    error,
    trackedTokens: streamRef.current?.trackedCount ?? 0,
    tickUpdates: ticksRef.current.updates,
    riskPct: cfgRef.current.riskPct,
    /** Contracts whose COA 2.0 ΔOI is measured from a real session open. */
    oiBaselines: ticksRef.current.baselined,
    /** The board is frozen on a finished session — nothing is being recomputed. */
    settled: settledRef.current,
    focus,
    setFocus,
    market,
    login,
    logout,
    refreshProfile,
    setProfile,
    enterDemo,
    switchMode,
    executeSignal,
    exitPosition,
    scaleOutPosition,
    panicFlatten,
    resetPaper,
    reloadMaster: loadMaster,
  };
}

/** Local 1 Hz countdown, seeded from the engine so the clock never drifts. */
export function useCountdown(seedSeconds: number | undefined) {
  const [seconds, setSeconds] = useState(seedSeconds ?? 0);

  useEffect(() => {
    if (seedSeconds === undefined) return;
    setSeconds(seedSeconds);
  }, [seedSeconds]);

  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  return seconds;
}

/** Fires an up/down flash class whenever a numeric value changes. */
export function useTickFlash(value: number | undefined) {
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const prev = useRef<number | undefined>(value);

  useEffect(() => {
    if (value === undefined || prev.current === undefined) {
      prev.current = value;
      return;
    }
    if (value === prev.current) return;
    setFlash(value > prev.current ? "up" : "down");
    prev.current = value;
    const id = setTimeout(() => setFlash(null), 620);
    return () => clearTimeout(id);
  }, [value]);

  return flash;
}
