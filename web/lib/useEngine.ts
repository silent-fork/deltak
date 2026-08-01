"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  EngineSnapshot,
  ExecutionMode,
  OptionChain,
  Position,
  RiskEvent,
  RrgNode,
  Signal,
  SpotQuote,
  Underlying,
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
import { ScripMaster, type MasterPayload } from "@/lib/engine/scripMaster";
import { runGuards } from "@/lib/engine/risk";
import { TickStore, type Tick } from "@/lib/stream/ticks";
import { SmartStreamClient, type StreamStatus } from "@/lib/stream/smartstream";
import { SimulatedFeed } from "@/lib/stream/simFeed";
import { useMarketData } from "@/lib/useMarketData";
import { clearMarketCache } from "@/lib/market/client";
import { api } from "@/lib/api";

/**
 * The Delta-K engine, running in the browser.
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

export interface EngineSession {
  authenticated: boolean;
  clientCode: string | null;
  feedToken: string | null;
  apiKey: string | null;
  loginTime: string | null;
}

const NO_SESSION: EngineSession = {
  authenticated: false,
  clientCode: null,
  feedToken: null,
  apiKey: null,
  loginTime: null,
};

export type StreamState = StreamStatus;

export function useEngine(simulate: boolean) {
  const [snapshot, setSnapshot] = useState<EngineSnapshot | null>(null);
  const [session, setSession] = useState<EngineSession>(NO_SESSION);
  const [mode, setMode] = useState<ExecutionMode>("paper");
  const [streamStatus, setStreamStatus] = useState<StreamStatus>("idle");
  const [masterReady, setMasterReady] = useState(false);
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
  const eventsRef = useRef<RiskEvent[]>([]);
  const scaledRef = useRef(new Set<string>());
  const daylightDoneRef = useRef(false);
  const resyncRef = useRef(0);
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

      if (pos.mode === "live" && sessionRef.current.authenticated) {
        try {
          await api.placeOrder({
            trading_symbol: pos.trading_symbol,
            symbol_token: pos.token,
            transaction_type: exitSide,
            quantity: pos.quantity,
            order_type: "MARKET",
          });
        } catch (err) {
          log(
            "INFO",
            `Exit order rejected: ${err instanceof Error ? err.message : "unknown"}`,
            pos.underlying,
          );
          return;
        }
      }

      const fill =
        pos.mode === "live"
          ? ltp
          : applySlippage(ltp, exitSide, cfgRef.current.slippagePct);
      const closed = ledgerRef.current.close(pos.id, fill, reason);
      if (closed) {
        void api.persist("positions", [closed]).catch(() => undefined);
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

      if (pos.mode === "live" && sessionRef.current.authenticated) {
        try {
          await api.placeOrder({
            trading_symbol: pos.trading_symbol,
            symbol_token: pos.token,
            transaction_type: exitSide,
            quantity: lots * pos.lot_size,
            order_type: "MARKET",
          });
        } catch {
          return;
        }
      }

      const fill =
        pos.mode === "live"
          ? ltp
          : applySlippage(ltp, exitSide, cfgRef.current.slippagePct);
      const residual = ledgerRef.current.reduce(pos.id, lots, fill, "TP1");
      if (residual) void api.persist("positions", [residual]).catch(() => undefined);
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

      for (const u of UNDERLYINGS) {
        const builder = buildersRef.current[u];
        const engine = signalEnginesRef.current[u];
        if (!builder || !engine) continue;
        const spot = ticksRef.current.ltp(master.spotToken(u));
        // Rotation only advances on real prints. With the market shut the
        // prices are frozen at the close, and pushing that same number into the
        // RRG window once a second would erase a replayed session inside a
        // minute — forty identical samples and every node is back at the origin.
        const chain = builder.build(master, ticksRef.current, spot, feedLive());
        chainsRef.current[u] = chain;
        signalsRef.current[u] = engine.evaluate(chain, master, cap, free);
      }

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
  }, [bookExit, bookScaleOut, buildSnapshot, feedLive, log, spotMap]);

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
      await loadMaster();
      if (cancelled) return;
      startFeed(sessionRef.current);
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
    seedTokens,
    wallTokens,
    onOiBaseline,
    onContractSession,
  });

  /**
   * The index itself, out of hours.
   *
   * Nothing else can be built without it: a spot of zero means no ATM strike,
   * no chain, and therefore no rotation nodes to draw whatever the replay
   * loaded. The candle session carries both the close and the one before it, so
   * the change on the day survives the market being shut.
   */
  const sessionClose = market.stats?.close ?? 0;
  const sessionPrevClose = market.stats?.prev_close ?? 0;
  useEffect(() => {
    if (isMarketOpen() || !spotToken || sessionClose <= 0) return;
    ticksRef.current.seedQuote(spotToken, {
      ltp: sessionClose,
      close: sessionPrevClose,
    });
  }, [spotToken, sessionClose, sessionPrevClose]);

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
    async (payload: { client_code: string; pin: string; totp: string }) => {
      const res = await api.login(payload);
      const next: EngineSession = {
        authenticated: true,
        clientCode: res.client_code,
        feedToken: res.feed_token,
        apiKey: res.api_key,
        loginTime: res.login_time,
      };
      setSession(next);
      sessionRef.current = next;
      // Anything cached from a previous session belonged to a different JWT.
      clearMarketCache();
      log("INFO", `SmartAPI session established for ${res.client_code}.`);
      startFeed(next);
      return res;
    },
    [log, startFeed],
  );

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
        mode: currentMode,
      });

      void api.persist("positions", [pos]).catch(() => undefined);
      log(
        "INFO",
        `${currentMode.toUpperCase()} BUY ${useLots}×${lotSize} ${signal.trading_symbol} @ ${fill.toFixed(2)}` +
          (brokerOrderId ? ` — order ${brokerOrderId}` : ""),
        underlying,
      );

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
    mode,
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
    focus,
    setFocus,
    market,
    login,
    logout,
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
