"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  Automation,
  Broker,
  EngineSnapshot,
  ExecutionMode,
  OptionChain,
  Position,
  RiskEvent,
  RrgNode,
  ScaleInDecision,
  Signal,
  SpotQuote,
  Underlying,
  UserProfile,
} from "@/lib/types";
import { archiveRowToPosition, type ArchiveRow } from "@/lib/engine/book";
import { withRetry } from "@/lib/retry";
import {
  DEFAULT_CONFIG,
  EXCHANGE_BSE_CM,
  EXCHANGE_BSE_FO,
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
import { decideScaleIn, runGuards } from "@/lib/engine/risk";
import { legRiskAtStop, portfolioRiskAtStop } from "@/lib/engine/sizing";
import { TickStore, type Tick } from "@/lib/stream/ticks";
import { SmartStreamClient, type StreamStatus } from "@/lib/stream/smartstream";
import { DhanFeedClient } from "@/lib/stream/dhanfeed";
import { SimulatedFeed } from "@/lib/stream/simFeed";
import { useMarketData, type MarketData } from "@/lib/useMarketData";
import type { VixRegime } from "@/lib/tools/volatilityDeskTypes";
import { clearMarketCache } from "@/lib/market/client";
import { api } from "@/lib/api";
import { setAnalyticsContext, track } from "@/lib/analytics";

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
 * Force a repaint at least this often, even if the dirty-check below found
 * nothing worth painting for. A safety net against staleness in whatever it
 * doesn't explicitly track (e.g. the tracked-token count after a resync) —
 * not the thing doing the actual work of keeping the board current.
 */
const HEARTBEAT_MS = 5_000;
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
/** How often this tab mirrors its signal state for a paired phone to read. */
const MOBILE_PUSH_MS = 5_000;
/** Focus fires on every alt-tab; do not spend a profile call on each one. */
const SESSION_FOCUS_MIN_MS = 5 * 60_000;
/**
 * How often the signal engine's own VIX regime read refreshes. The
 * Volatility Desk route caches its NSE VIX read server-side for 30 minutes
 * (`lib/tools/vix.ts`), so polling much faster than that would only ever
 * see the same cached value — this just needs to notice a regime change
 * reasonably soon after that cache actually rolls over.
 */
const VIX_POLL_MS = 10 * 60_000;
/**
 * Autopilot-only: how long an underlying stays off-limits to Autopilot after
 * a TARGET or STOP_LOSS exit — long enough that a level the protocol just
 * proved wrong isn't immediately re-armed on the very next tick's noise.
 * Manual re-entry is never blocked by this; see `autoCooldownUntilRef`.
 */
const AUTO_REENTRY_COOLDOWN_MS = 15 * 60_000;

export interface EngineSession {
  authenticated: boolean;
  broker: Broker | null;
  clientCode: string | null;
  feedToken: string | null;
  apiKey: string | null;
  loginTime: string | null;
  /** Who is signed in. Null while a profile read is failing, never a blocker. */
  profile: UserProfile | null;
}

const NO_SESSION: EngineSession = {
  authenticated: false,
  broker: null,
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

/**
 * Checkpoints the ledger's own running totals so the Paper Wallet card can
 * seed from them on the next login instead of resetting to the default
 * starting capital — see `Ledger.restoreWallet`. Called after every entry,
 * exit and scale-out, each of which already moved `capital`/`charges`/
 * `realised` locally; this just mirrors whatever the ledger now holds.
 */
const saveWallet = (ledger: Ledger) => {
  void api
    .persistWallet({ capital: ledger.capital, charges: ledger.charges, realised: ledger.realised })
    .catch(() => undefined);
};

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
   * Bumped every time `masterRef.current` is *replaced*, not just whenever it
   * becomes ready. The bootstrap effect below can call `loadMaster` twice —
   * once assuming Angel One before the session is known, again with Dhan's
   * once a Dhan session resolves — and both loads report `ready: true`, so a
   * memo keyed on the `masterReady` boolean alone would never re-run for the
   * second swap: `true → true` is not a change React re-renders for. This
   * counter is what `spotTokens`/`spotToken` below actually key off.
   */
  const [masterVersion, setMasterVersion] = useState(0);
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

  // Keeps every analytics event tagged with the session facts that matter
  // most for segmenting a trading terminal's usage, without re-sending them
  // from every individual call site. `user_id` is the field Amplitude/GA4's
  // Zaraz components key identity off of; `client_code` rides along too
  // since it's the more recognisable name for the same value on this site's
  // own dashboards — a Dhan client ID flows through this exact same field,
  // not just Angel One's. `broker` used to ride along only on the three
  // login-flow events (LoginScreen's own `login_attempt`/`login_success`/
  // `login_failed`); every event fired after that — signal_executed,
  // position_closed, mode_switch, panic_flatten, the lot — had no broker
  // dimension at all, so Amplitude/GA4 could segment by broker at the
  // instant of login and nowhere else. Client code/name/mobile stay out of
  // third-party analytics entirely, same discipline as `login_failed` never
  // sending its detail. Clears back to `undefined` on sign-out rather than
  // leaking the last session's identity onto whatever a now-anonymous tab
  // does next.
  useEffect(() => {
    setAnalyticsContext({
      authenticated: session.authenticated,
      automation,
      focused_underlying: focus,
      user_id: session.clientCode ?? undefined,
      client_code: session.clientCode ?? undefined,
      broker: session.broker ?? undefined,
    });
  }, [session.authenticated, session.clientCode, session.broker, automation, focus]);

  /**
   * Which index gets watched most is itself worth seeing, not just the
   * ambient tag on other events — hence a discrete event here too, on top
   * of `focused_underlying` riding along on everything else above.
   */
  const setFocusTracked = useCallback((next: Underlying) => {
    setFocus(next);
    track("focus_change", { underlying: next });
  }, []);

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
  /**
   * Positions already given their one manually-triggered scale-in add —
   * in-memory only, same posture as `scaledRef` above: a reload before the
   * position closes loses the flag, which is an accepted gap for a
   * capital-gated, manual-only action rather than something worth a DB
   * migration to close. See `decideScaleIn` in `risk.ts` for the rule.
   */
  const scaledInRef = useRef(new Set<string>());
  /**
   * Autopilot-only re-entry cooldown, per underlying — the epoch ms an
   * underlying becomes eligible again after a TARGET or STOP_LOSS exit. Set
   * in `bookExit` below, read by the Autopilot firing loop further down.
   * Deliberately not set for MANUAL, PANIC, TP1, DAYLIGHT_REST or
   * INVALIDATION exits: an operator's own close (or a scale-out, which
   * isn't an exit at all) isn't the "protocol just proved this level wrong"
   * signal a hit stop or target is — a manual close should be free to
   * re-enter immediately if the signal is still actionable.
   */
  const autoCooldownUntilRef = useRef<Record<string, number>>({});
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

  /**
   * `buildSnapshot`'s RRG-node cache, per underlying: the chain each
   * underlying's node list was last computed from, and that list itself. A
   * `chainsRef.current[u]` that is still the same object the cache was built
   * from means nothing that feeds the RRG changed, so the old array is handed
   * back rather than re-walked.
   */
  const lastRrgChainRef = useRef<Record<string, OptionChain | undefined>>({});
  const lastRrgNodesRef = useRef<Record<string, RrgNode[]>>({});

  /**
   * What `setSnapshot` was last called with, so the 1 Hz loop can tell a tick
   * that changed nothing from one that did — see the dirty-check in `tick`.
   */
  const lastRevisionRef = useRef(-1);
  const lastEventsCountRef = useRef(-1);
  const lastMarketOpenRef = useRef<boolean | null>(null);
  const lastFeedLiveRef = useRef<boolean | null>(null);
  const lastSettledRef = useRef<boolean | null>(null);
  const lastRenderAtRef = useRef(0);
  /** Skip repainting a tab nobody is looking at; the engine keeps running. */
  const hiddenRef = useRef(false);

  /** Gates the mobile-companion push to once per `MOBILE_PUSH_MS`, not once a tick. */
  const lastMobilePushRef = useRef(0);

  const streamRef = useRef<SmartStreamClient | null>(null);
  const dhanStreamRef = useRef<DhanFeedClient | null>(null);
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
    dhanStreamRef.current?.stop();
    simRef.current?.stop();
    setSimulated(false);
  }, []);

  /**
   * Both brokers group instruments into the same `{nse, bse}` shape
   * (`ScripMaster.subscriptionTokens` is broker-agnostic — it just reads
   * `Instrument.exchSeg`), so the split into segments/exchange-types is the
   * only broker-specific piece, kept in these two small dispatchers rather
   * than duplicated at every call site that needs to (re)subscribe.
   */
  const trackAngelOne = (
    client: SmartStreamClient,
    nse: { spotTokens: string[]; optionTokens: string[] },
    bse: { spotTokens: string[]; optionTokens: string[] },
    method: "track" | "subscribeNew",
  ) => {
    client[method](EXCHANGE_NSE_CM, nse.spotTokens);
    client[method](EXCHANGE_NSE_FO, nse.optionTokens);
    if (bse.spotTokens.length) client[method](EXCHANGE_BSE_CM, bse.spotTokens);
    if (bse.optionTokens.length) client[method](EXCHANGE_BSE_FO, bse.optionTokens);
  };

  const trackDhan = (
    client: DhanFeedClient,
    nse: { spotTokens: string[]; optionTokens: string[] },
    bse: { spotTokens: string[]; optionTokens: string[] },
    method: "track" | "subscribeNew",
  ) => {
    const spots = [...nse.spotTokens, ...bse.spotTokens];
    if (spots.length) client[method]("IDX_I", spots);
    if (nse.optionTokens.length) client[method]("NSE_FNO", nse.optionTokens);
    if (bse.optionTokens.length) client[method]("BSE_FNO", bse.optionTokens);
  };

  const subscribeOptionToken = useCallback((underlying: string, token: string) => {
    const onBse = INDEX_UNIVERSE[underlying]?.exchange === "BSE";
    if (sessionRef.current.broker === "dhan") {
      dhanStreamRef.current?.subscribeNew(onBse ? "BSE_FNO" : "NSE_FNO", [token]);
    } else {
      streamRef.current?.subscribeNew(onBse ? EXCHANGE_BSE_FO : EXCHANGE_NSE_FO, [token]);
    }
  }, []);

  const startFeed = useCallback(
    (sess: EngineSession) => {
      stopFeeds();
      const onTick = (t: Tick) => ticksRef.current.apply(t);

      if (sess.authenticated && sess.broker === "dhan" && sess.feedToken && sess.clientCode) {
        const client = new DhanFeedClient(onTick, setStreamStatus);
        dhanStreamRef.current = client;
        const { nse, bse } = masterRef.current.subscriptionTokens(
          spotMap(),
          cfgRef.current.chainDepth,
        );
        trackDhan(client, nse, bse, "track");
        client.start({ clientId: sess.clientCode, accessToken: sess.feedToken });
        log("INFO", "Dhan live market feed engaged (full packet mode).");
      } else if (sess.authenticated && sess.feedToken && sess.clientCode && sess.apiKey) {
        const client = new SmartStreamClient(onTick, setStreamStatus);
        streamRef.current = client;
        const { nse, bse } = masterRef.current.subscriptionTokens(
          spotMap(),
          cfgRef.current.chainDepth,
        );
        trackAngelOne(client, nse, bse, "track");
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
        saveWallet(ledgerRef.current);
        if (reason === "TARGET" || reason === "STOP_LOSS") {
          autoCooldownUntilRef.current[closed.underlying] = Date.now() + AUTO_REENTRY_COOLDOWN_MS;
        }
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
        track("position_closed", {
          reason,
          underlying: closed.underlying,
          protocol: closed.protocol,
          mode: closed.mode,
          pnl: closed.realised_pnl,
        });
      }
    },
    [log],
  );

  const bookScaleOut = useCallback(
    async (pos: Position, fraction: number) => {
      // A 1-lot position can't be *scaled* at all — the exchange only
      // trades whole lots, so the fraction has nothing left to reduce.
      // This used to fall through to `lots >= pos.lots` below and silently
      // execute a full close instead, which reads as "scale out" doing
      // something the caller didn't ask for. The trade book's own scale
      // button is already disabled below 2 lots; this is the function
      // itself refusing to guess for whatever calls it next.
      if (pos.lots < 2) {
        throw new Error(
          `Cannot scale out ${pos.trading_symbol} — only 1 lot is open. Close the position instead.`,
        );
      }

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
      saveWallet(ledgerRef.current);
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
      track("position_scaled_out", {
        underlying: pos.underlying,
        protocol: pos.protocol,
        mode: pos.mode,
        lots,
      });
    },
    [bookExit, log],
  );

  /**
   * Ratchets a position's stop — the trailing-stop guard's own write path,
   * same shape as `bookExit`/`bookScaleOut`: the guard in `risk.ts` only
   * decides *what* the new stop should be, this is what actually mutates
   * the ledger and persists it. No order is placed — a stop move is
   * bookkeeping, not a fill.
   */
  const bookTrail = useCallback(async (pos: Position, newStop: number) => {
    const updated = ledgerRef.current.tightenStop(pos.id, newStop);
    if (updated) savePositions([updated]);
  }, []);

  /* ---------------------------------------------------------- snapshot */

  const feedLive = useCallback(
    () =>
      streamRef.current?.status === "live" ||
      dhanStreamRef.current?.status === "live" ||
      !!simRef.current?.running,
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

    /**
     * The RRG node list only depends on the chain it was built from — never
     * on the calendar — so a `buildSnapshot` call that fires because the
     * ledger or the event log changed (not because any chain rebuilt) can
     * hand back the exact array it handed back last time. That is what lets
     * `RrgScatter` (a Recharts SVG plot) bail out of re-rendering on a
     * snapshot that has nothing new for it.
     */
    const rrgNodes: Record<string, RrgNode[]> = {};
    for (const u of UNDERLYINGS) {
      const chain = chainsRef.current[u];
      if (chain && lastRrgChainRef.current[u] === chain) {
        rrgNodes[u] = lastRrgNodesRef.current[u] ?? [];
        continue;
      }

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
      lastRrgChainRef.current[u] = chain;
      lastRrgNodesRef.current[u] = nodes;
    }

    /**
     * Scale-in eligibility, recomputed fresh every snapshot rather than
     * cached anywhere — cheap (one `decideScaleIn` per open position) and
     * this is purely informational for the UI's "Add" affordance;
     * `scaleInPosition` re-derives it again itself right before actually
     * filling, so a snapshot that's a tick stale here costs nothing.
     */
    const scaleIn: Record<string, ScaleInDecision> = {};
    for (const pos of ledgerRef.current.openPositions) {
      const chain = chainsRef.current[pos.underlying];
      const decision = decideScaleIn({
        pos,
        ltp: ticks.ltp(pos.token, pos.ltp),
        spot: chain?.spot ?? 0,
        aegis1: chain?.levels.aegis_1 ?? null,
        zenith1: chain?.levels.zenith_1 ?? null,
        quadrant: rrgRef.current[pos.underlying]?.quadrant(pos.token) ?? null,
        vixRegime: vixRef.current,
        alreadyScaledIn: scaledInRef.current.has(pos.id),
        cfg,
      });
      if (decision) scaleIn[pos.id] = decision;
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
      scale_in: scaleIn,
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
          if (!builder) continue;
          const spot = ticksRef.current.ltp(master.spotToken(u));
          // Rotation advances on real prints in a live session, and on nothing
          // else — a replayed session must survive the loop that follows it.
          chainsRef.current[u] = builder.build(master, ticksRef.current, spot, plan.advance);
        }
      }

      /**
       * Signals are re-evaluated every tick, not gated on `plan.rebuild` like
       * the chain above: `trading` has to take effect the instant the market
       * closes, and the tick right after the bell is exactly one where
       * nothing else changed enough to trigger a rebuild — a signal gated on
       * `rebuild` would keep showing whatever was actionable one second
       * before close until the next replay/seed happened to land. Cheap: it
       * rides on whatever chain already exists, real or carried over.
       */
      for (const u of UNDERLYINGS) {
        const engine = signalEnginesRef.current[u];
        const chain = chainsRef.current[u];
        if (!engine || !chain) continue;
        signalsRef.current[u] = engine.evaluate(chain, master, cap, free, {
          marketPcr: marketRef.current?.pcr[u] ?? null,
          buildupClass: marketRef.current?.buildup[u] ?? null,
          // `plan.guards` is exactly `planTick`'s own `marketOpen || simulated`
          // (see loop.ts) — reused here rather than recomputed, so there is
          // one source of truth for "is there a real market right now" and
          // the signal engine never proposes a trade off replayed history.
          trading: plan.guards,
          vixRegime: vixRef.current,
        });
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
          trail: bookTrail,
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
        const angelClient = streamRef.current;
        const dhanClient = dhanStreamRef.current;
        if (angelClient?.status === "live" || dhanClient?.status === "live") {
          const { nse, bse } = master.subscriptionTokens(
            spotMap(),
            cfgRef.current.chainDepth,
          );
          if (angelClient?.status === "live") trackAngelOne(angelClient, nse, bse, "subscribeNew");
          if (dhanClient?.status === "live") trackDhan(dhanClient, nse, bse, "subscribeNew");
        }
      }

      /*
       * Paint only when something in the snapshot could actually be
       * different. `plan.rebuild` covers new prints and freshly replayed
       * history; the ledger's own revision counter covers a fill, an exit or
       * a mark that moved a P&L (guards run on every trading tick whether or
       * not they act, so they are not by themselves a reason to paint); the
       * event count covers a log line with nothing else attached to it; and
       * the market-open/feed/settled flags cover the clock crossing a
       * session boundary on its own, with no print to carry the news. The
       * heartbeat is the backstop for anything this list missed.
       */
      const marketOpenNow = isMarketOpen();
      const feedLiveNow = feedLive();
      const eventsCount = eventsRef.current.length;
      const ledgerRevision = ledger.revision;
      const now = Date.now();
      const dirty =
        plan.rebuild ||
        ledgerRevision !== lastRevisionRef.current ||
        eventsCount !== lastEventsCountRef.current ||
        marketOpenNow !== lastMarketOpenRef.current ||
        feedLiveNow !== lastFeedLiveRef.current ||
        plan.settled !== lastSettledRef.current ||
        now - lastRenderAtRef.current >= HEARTBEAT_MS;

      if (dirty) {
        lastRevisionRef.current = ledgerRevision;
        lastEventsCountRef.current = eventsCount;
        lastMarketOpenRef.current = marketOpenNow;
        lastFeedLiveRef.current = feedLiveNow;
        lastSettledRef.current = plan.settled;
        lastRenderAtRef.current = now;
        // The engine (guards, mark-to-market, checkpointing) has already run
        // above regardless; a hidden tab only skips the paint, never the work
        // that keeps circuit breakers and the ledger honest.
        if (!hiddenRef.current) setSnapshot(buildSnapshot());
      }
    } finally {
      busyRef.current = false;
    }
  }, [bookExit, bookScaleOut, bookTrail, buildSnapshot, feedLive, log, spotMap]);

  /**
   * Repaint the instant the tab comes back into view, rather than leaving it
   * on whatever was on screen when it was hidden until the next dirty tick.
   */
  useEffect(() => {
    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden";
      hiddenRef.current = hidden;
      if (!hidden) {
        lastRenderAtRef.current = Date.now();
        setSnapshot(buildSnapshot());
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [buildSnapshot]);

  /* --------------------------------------------------------- lifecycle */

  const loadMaster = useCallback(async (broker?: Broker) => {
    try {
      const b = broker ?? sessionRef.current.broker ?? "angelone";
      const payload = await withRetry(() => api.master(b) as Promise<MasterPayload>);
      masterRef.current = new ScripMaster(payload);
      setMasterReady(masterRef.current.ready);
      setMasterVersion((v) => v + 1);
      setError(null);
      log(
        "INFO",
        `Scrip master loaded — ${payload.totalRecords.toLocaleString("en-IN")} records projected.`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Scrip master fetch failed";
      setError(message);
      log("INFO", `Scrip master unavailable after 3 attempts: ${message} — retrying in the background.`);
    }
    return masterRef.current;
  }, [log]);

  /** Every OPEN position Supabase still has on file for this account. */
  const loadOpenPositions = useCallback(async (): Promise<Position[]> => {
    try {
      const rows = await withRetry(() => api.history("positions", { limit: "100" }));
      const list = Array.isArray(rows) ? (rows as ArchiveRow[]) : [];
      return list.map(archiveRowToPosition).filter((p) => p.status === "OPEN");
    } catch {
      return [];
    }
  }, []);

  /**
   * The master is not optional — nothing renders without it, and unlike the
   * historical-data polls in `useMarketData` it has no loop of its own to
   * fall back on if the three quick retries inside `loadMaster` still come
   * up empty (a real outage, not a blip). This covers that case without
   * asking the operator to reload the tab themselves, backing off to a slow,
   * patient cadence instead of hammering a downed endpoint — and stops the
   * moment a load actually lands.
   */
  useEffect(() => {
    if (!sessionChecked || masterReady) return;
    const id = setInterval(() => {
      if (!masterRef.current.ready) void loadMaster();
    }, 30_000);
    return () => clearInterval(id);
  }, [sessionChecked, masterReady, loadMaster]);

  useEffect(() => {
    const cfg = cfgRef.current;
    for (const u of UNDERLYINGS) {
      const rrg = new RrgEngine(
        INDEX_UNIVERSE[u].rrgWindow ?? cfg.rrgWindow,
        INDEX_UNIVERSE[u].rrgMomentumLookback ?? cfg.rrgMomentumLookback,
        cfg.rrgTailLength,
        INDEX_UNIVERSE[u].rrgMinSamples,
      );
      const builder = new ChainBuilder(u, rrg, cfg);
      rrgRef.current[u] = rrg;
      buildersRef.current[u] = builder;
      signalEnginesRef.current[u] = new SignalEngine(u, builder, cfg);
    }

    let cancelled = false;
    void (async () => {
      // All three before the feed: the master supplies the tokens to
      // subscribe to, the session supplies the credentials to subscribe
      // with, and the open book supplies what to re-admit into it once it
      // exists.
      const [restored, , openFromDb] = await Promise.all([
        restoreSession(),
        loadMaster(), // fires immediately assuming Angel One — the common case, and the only one known before restoreSession resolves
        loadOpenPositions(),
      ]);
      if (cancelled) return;
      // A Dhan session needs Dhan's own master (different security-ID space,
      // different projection) — re-fetched now that the broker is known,
      // rather than guessed at before the session restore above resolved.
      if (restored.authenticated && restored.broker === "dhan") {
        await loadMaster("dhan");
        if (cancelled) return;
      }

      // Seed the wallet from wherever this account's own checkpoint last left
      // it, before anything below can move it — a never-traded account (or
      // one saved before this column existed) has nothing here, and the
      // ledger's own constructor default stands.
      const wallet = restored.profile;
      if (
        restored.authenticated &&
        wallet?.paper_capital != null &&
        wallet?.paper_charges != null &&
        wallet?.paper_realised_pnl != null
      ) {
        ledgerRef.current.restoreWallet(
          wallet.paper_capital,
          wallet.paper_charges,
          wallet.paper_realised_pnl,
        );
      }

      startFeed(restored.authenticated ? restored : sessionRef.current);

      /**
       * Re-admit whatever this account still had open at last checkpoint —
       * mode always starts back at "paper" on a fresh load (see `switchMode`),
       * so a stored live position has no local counterpart to reconcile
       * against yet and is left for the broker's own book, not silently
       * adopted here. Each restored position also needs its own option token
       * force-subscribed: the band-based subscription in `startFeed` only
       * covers strikes near today's ATM, and a position opened a session ago
       * may since have drifted outside it.
       */
      const toRestore = openFromDb.filter((p) => p.mode === modeRef.current);
      if (toRestore.length) {
        for (const pos of toRestore) {
          ledgerRef.current.restore(pos);
          // A nonzero realised P&L on a still-open position only ever comes
          // from a prior scale-out (see `Ledger.reduce`) — the one signal a
          // restored position carries for "already scaled once", since the
          // in-memory `scaled` set itself does not survive a reload.
          if (pos.realised_pnl !== 0) scaledRef.current.add(pos.id);
          subscribeOptionToken(pos.underlying, pos.token);
        }
        log(
          "INFO",
          `Restored ${toRestore.length} open position(s) from a previous session — live monitoring resumed.`,
        );
        track("positions_restored", { count: toRestore.length });
      }

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
    // The master is a ref; `masterVersion` is the state edge that says it
    // was (re)loaded — see its declaration for why `masterReady` alone
    // isn't enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [masterVersion],
  );

  const spotToken = useMemo(
    () => masterRef.current.spotToken(focus),
    // The master is a ref; `masterVersion` is the state edge that says it
    // was (re)loaded — see its declaration for why `masterReady` alone
    // isn't enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [focus, masterVersion],
  );

  /**
   * Contracts to baseline, nearest the money first. Order matters: the seed
   * pass stops on the first rate-limit, and if it only ever gets part of the
   * way through, the strikes it did reach should be the ones the walls and the
   * driver actually sit on.
   *
   * `oiSeedSpan` (5 strikes either side) was sized against Angel One's
   * historical endpoints specifically — `getCandleData` and `getOIData` are
   * two separate metered calls per contract, throttled hard enough that
   * seeding the *whole* rendered chain (chainDepth, 12 either side) routinely
   * wouldn't finish before the next poll cycle came around. Dhan's
   * `/charts/intraday` covers both candles and OI in one call, and its
   * published cap (5 req/sec general, no separate historical-endpoint
   * throttle) is looser than what actually gated Angel One — so a Dhan
   * session seeds the full rendered band instead of the narrower one.
   */
  const seedSpan =
    session.broker === "dhan" ? cfgRef.current.chainDepth : cfgRef.current.oiSeedSpan;
  const seedTokens = useMemo(() => {
    const atm = focusChain?.atm_strike ?? 0;
    if (!focusChain || !atm) return [];
    const span = INDEX_UNIVERSE[focus].strikeStep * seedSpan;
    return focusChain.rows
      .filter((r) => Math.abs(r.strike - atm) <= span)
      .sort((a, b) => Math.abs(a.strike - atm) - Math.abs(b.strike - atm))
      .flatMap((r) => [r.call?.token, r.put?.token])
      .filter((t): t is string => !!t);
  }, [focusChain, focus, seedSpan]);

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
   * Replay a contract's last session into the ladder — price only, not RRG.
   *
   * This only ever runs while the market is shut (the effect that calls it in
   * `useMarketData` skips outright while it's open), so it seeds the option
   * chain with the closing premium rather than leaving every cell dashed, but
   * does not feed the RRG windows: a rotation reconstructed from five-minute
   * replay jumps reads as noise, not history, and the plot shows a plain
   * "market closed" state instead rather than pretending to have rotated.
   */
  const onContractSession = useCallback(
    (
      token: string,
      replay: { pairs: [number, number][]; lastClose: number; volume: number },
    ) => {
      ticksRef.current.seedQuote(token, {
        ltp: replay.lastClose,
        volume: replay.volume,
      });
    },
    [],
  );

  const market = useMarketData({
    enabled: session.authenticated,
    broker: session.broker ?? "angelone",
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
   * India VIX's regime, read into the signal engine's own `evaluate()`
   * context (see the `tick` loop below). Independent of `session.authenticated`
   * on purpose for Angel One and signed-out tabs alike: the Volatility Desk
   * route is public NSE data, so it polls on its own schedule rather than
   * riding `useMarketData`'s broker-gated one. A Dhan session gets a live
   * read instead (`/api/tools/vix-live`, off Dhan's own market feed) rather
   * than NSE's ~EOD-cadence history — see that route's own comment for why
   * Angel One keeps the historical path. Best-effort either way — a failed
   * read just leaves stop/risk sizing at their VIX-unaware baseline, same as
   * before this existed.
   */
  const vixRef = useRef<VixRegime | null>(null);
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res =
          session.broker === "dhan" ? await api.tools.vixLive() : await api.tools.volatilityDesk();
        if (!cancelled) vixRef.current = res.vix?.regime ?? null;
      } catch {
        // Leave whatever the last good read was rather than blanking it on
        // one transient failure.
      }
    };
    void poll();
    const id = setInterval(() => void poll(), VIX_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [session.broker]);

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
      broker?: Broker;
      client_code: string;
      pin: string;
      totp: string;
      turnstile_token?: string;
    }) => {
      const res = await api.login(payload);
      const next: EngineSession = {
        authenticated: true,
        broker: res.broker ?? "angelone",
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
      // A broker switch (or re-login as a different account) without a full
      // page reload otherwise left the previous session's own live positions
      // sitting in memory — the Trade Book merges this against Supabase, so
      // a stale Angel One position kept showing up even after signing into
      // Dhan, the client_code scoping on the archive fetch below notwithstanding.
      ledgerRef.current.reset();
      // The reset above always lands on the default starting capital; if this
      // account already has a wallet checkpoint from a previous session,
      // restore it now rather than leaving a signed-in operator looking at a
      // capital figure that resets every time they switch broker or re-login.
      const wallet = res.profile;
      if (wallet?.paper_capital != null && wallet?.paper_charges != null && wallet?.paper_realised_pnl != null) {
        ledgerRef.current.restoreWallet(wallet.paper_capital, wallet.paper_charges, wallet.paper_realised_pnl);
      }
      log(
        "INFO",
        `${next.broker === "dhan" ? "Dhan" : "SmartAPI"} session established for ${res.profile?.name ?? res.client_code}.`,
      );
      // The bootstrap effect may have already loaded the *other* broker's
      // master (or none, before any session existed) — always reload for the
      // broker that just signed in, rather than trust whatever is cached.
      await loadMaster(next.broker ?? "angelone");
      startFeed(next);
      return res;
    },
    [log, startFeed, loadMaster],
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
        broker: res.broker ?? "angelone",
        clientCode: res.client_code,
        feedToken: res.feed_token ?? null,
        apiKey: res.api_key ?? null,
        loginTime: res.login_time ?? null,
        profile: res.profile ?? null,
      };
      setSession(next);
      sessionRef.current = next;
      const who = res.profile?.name ?? res.client_code;
      const brokerLabel = next.broker === "dhan" ? "Dhan" : "SmartAPI";
      log(
        "INFO",
        res.refreshed
          ? `${brokerLabel} session refreshed for ${who} — tokens renewed past expiry.`
          : `${brokerLabel} session restored for ${who}.`,
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
    track("sign_out");
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
        log(
          "INFO",
          res.reason === "superseded"
            ? "Signed out — this account was signed in from another window."
            : sessionRef.current.broker === "dhan"
              ? "Dhan session expired — sign in again to resume the feed."
              : "SmartAPI session expired — sign in again to resume the feed.",
        );
        return;
      }

      // A refresh mints a new feed token, and the old socket is authenticated
      // with the old one: reconnect rather than let it die quietly. Angel One
      // only — Dhan's branch of `/api/auth/session` never sets `refreshed`,
      // since there is no refresh path for a Dhan access token.
      if (res.refreshed && res.client_code) {
        const next: EngineSession = {
          authenticated: true,
          broker: res.broker ?? "angelone",
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

  /**
   * Mirror this tab's signal state to Supabase, for a paired phone to read
   * back — see `lib/server/mobile.ts`. `snapshot` updates every tick, but a
   * phone glancing at "what's armed right now" does not need once-a-second
   * freshness, so a ref gates the actual network call to once per
   * `MOBILE_PUSH_MS` regardless of how often this effect re-runs. Fires
   * whether or not any phone is actually paired to read it, same as every
   * other best-effort write here.
   *
   * Open positions ride along here too, not just the ledger's totals —
   * without them a phone's per-position P&L was only as fresh as the last
   * `CHECKPOINT_EVERY_TICKS` write to `positions` (up to a minute), while the
   * aggregate open_pnl above updated every `MOBILE_PUSH_MS`. The DB
   * checkpoint stays exactly what it was: the failsafe a phone falls back to
   * once this tab stops pushing (closed tab, dead network) rather than
   * freezing on stale numbers with no source of truth at all.
   */
  useEffect(() => {
    if (!session.authenticated || !snapshot) return;
    if (Date.now() - lastMobilePushRef.current < MOBILE_PUSH_MS) return;
    lastMobilePushRef.current = Date.now();
    void api
      .mobile.push({
        ts: snapshot.ts,
        mode: snapshot.mode,
        market_open: snapshot.market_open,
        signals: snapshot.signals,
        open_positions: snapshot.ledger.open_positions,
        ledger: {
          capital: snapshot.ledger.capital,
          equity: snapshot.ledger.equity,
          deployed_margin: snapshot.ledger.deployed_margin,
          charges: snapshot.ledger.charges,
          open_pnl: snapshot.ledger.open_pnl,
          realised_pnl: snapshot.ledger.realised_pnl,
          total_pnl: snapshot.ledger.total_pnl,
          open_count: snapshot.ledger.open_positions.length,
        },
      })
      .catch(() => undefined);
  }, [snapshot, session.authenticated]);

  const switchMode = useCallback(
    (next: ExecutionMode) => {
      if (next === "live") {
        if (!sessionRef.current.authenticated) {
          throw new Error("Live mode requires a SmartAPI session.");
        }
        if (sessionRef.current.broker !== "angelone") {
          throw new Error(
            "Live order routing is only available for Angel One sessions — Dhan is wired for data only.",
          );
        }
        if (!ticksRef.current.updates) {
          throw new Error("Refusing Live mode without a live market feed.");
        }
      }
      setMode(next);
      modeRef.current = next;
      log("INFO", `Execution mode switched to ${next.toUpperCase()}.`);
      track("mode_switch", { mode: next });
    },
    [log],
  );

  const setAutomation = useCallback(
    (next: Automation) => {
      setAutomationState(next);
      log("INFO", `${next === "auto" ? "Autopilot engaged — actionable signals execute themselves." : "Manual control — signals wait for Execute."}`);
      track("automation_switch", { automation: next });
    },
    [log],
  );

  const executeSignal = useCallback(
    async (underlying: string, lots?: number, automation: Automation = "manual") => {
      const signal = signalsRef.current[underlying];
      if (!signal?.token || !signal.trading_symbol || !signal.sizing) {
        throw new Error("Signal has no executable node.");
      }
      const useLots = lots ?? signal.sizing.lots;
      if (useLots <= 0) throw new Error("Sizing resolved to zero lots.");

      const ledger = ledgerRef.current;
      // One signal, one open position: re-firing the same contract before it's
      // closed is how a manual click (or a signal that stays actionable for
      // minutes) would otherwise stack several entries on the same node before
      // the position-count/portfolio-risk ceilings below ever engaged.
      if (ledger.openPositions.some((p) => p.token === signal.token)) {
        throw new Error(
          `Order rejected: a position is already open on ${signal.trading_symbol}.`,
        );
      }
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
        automation,
        broker: sessionRef.current.broker,
      });

      savePositions([pos]);
      saveWallet(ledger);
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
        `${automation === "auto" ? "AUTOPILOT " : ""}${currentMode.toUpperCase()} BUY ${useLots}×${lotSize} ${signal.trading_symbol} @ ${fill.toFixed(2)}` +
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

      track("signal_executed", {
        automation,
        protocol: signal.protocol,
        underlying,
        mode: currentMode,
        lots: useLots,
      });

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
   * Phase 4's scale-in — manual only, never called by Autopilot or any
   * guard in `risk.ts`. Re-derives `decideScaleIn` fresh against the live
   * chain/RRG/VIX state rather than trusting whatever the last snapshot's
   * `scale_in` map said, the same "never trust stale UI state for a real
   * fill" posture `executeSignal` already takes for a fresh entry — and
   * re-checks the portfolio-risk ceiling and free capital against the add's
   * own numbers, since `decideScaleIn` deliberately leaves both to the caller.
   *
   * The risk-ceiling check decomposes the position's total risk-at-new-stop
   * into its existing lots (at the old avg price) plus the add (at the fresh
   * fill price) rather than computing a blended average here — the two sums
   * to the same rupee figure `legRiskAtStop` would give a true blended
   * position, since `(newAvg - stop) * totalQty` distributes exactly over
   * `(oldAvg - stop) * oldQty + (fill - stop) * addQty` by construction.
   */
  const scaleInPosition = useCallback(
    async (positionId: string) => {
      const ledger = ledgerRef.current;
      const pos = ledger.get(positionId);
      if (!pos) throw new Error("Position not found.");

      const chain = chainsRef.current[pos.underlying];
      const ltp = ticksRef.current.ltp(pos.token, pos.ltp);
      const decision = decideScaleIn({
        pos,
        ltp,
        spot: chain?.spot ?? 0,
        aegis1: chain?.levels.aegis_1 ?? null,
        zenith1: chain?.levels.zenith_1 ?? null,
        quadrant: rrgRef.current[pos.underlying]?.quadrant(pos.token) ?? null,
        vixRegime: vixRef.current,
        alreadyScaledIn: scaledInRef.current.has(pos.id),
        cfg: cfgRef.current,
      });
      if (!decision) {
        throw new Error(`${pos.trading_symbol} is not eligible for a scale-in right now.`);
      }

      const addQty = decision.addLots * pos.lot_size;
      const existingRisk = legRiskAtStop({
        side: pos.side,
        avg_price: pos.avg_price,
        stop_loss: decision.newStop,
        quantity: pos.quantity,
      });
      const addRisk = legRiskAtStop({
        side: pos.side,
        avg_price: ltp,
        stop_loss: decision.newStop,
        quantity: addQty,
      });
      const otherRisk = portfolioRiskAtStop(ledger.openPositions.filter((p) => p.id !== pos.id));
      const riskCeiling = ledger.equity * (cfgRef.current.maxPortfolioRiskPct / 100);
      if (otherRisk + existingRisk + addRisk > riskCeiling) {
        throw new Error(
          `Scale-in rejected: portfolio at-risk ₹${Math.round(otherRisk + existingRisk + addRisk).toLocaleString("en-IN")} ` +
            `would exceed the ${cfgRef.current.maxPortfolioRiskPct}% ceiling ` +
            `(₹${Math.round(riskCeiling).toLocaleString("en-IN")}).`,
        );
      }

      const addCost = ltp * addQty;
      const free = Math.max(0, ledger.equity - ledger.deployed);
      if (addCost > free) {
        throw new Error(
          `Scale-in rejected: adding ${decision.addLots} lot(s) of ${pos.trading_symbol} needs ` +
            `₹${Math.round(addCost).toLocaleString("en-IN")}, only ₹${Math.round(free).toLocaleString("en-IN")} free.`,
        );
      }

      const currentMode = modeRef.current;
      let fill = ltp;
      let brokerOrderId: string | null = null;

      if (currentMode === "live") {
        const res = await api.placeOrder({
          trading_symbol: pos.trading_symbol,
          symbol_token: pos.token,
          transaction_type: pos.side,
          quantity: addQty,
          order_type: "MARKET",
        });
        brokerOrderId = res.order_id ?? null;
      } else {
        fill = applySlippage(ltp, pos.side, cfgRef.current.slippagePct);
      }

      const updated = ledger.addToPosition(pos.id, decision.addLots, fill, decision.newStop, decision.newTarget);
      if (!updated) throw new Error("Scale-in failed to apply.");
      scaledInRef.current.add(pos.id);

      savePositions([updated]);
      saveWallet(ledger);
      saveOrder(
        orderRow({
          position: updated,
          transactionType: pos.side,
          quantity: addQty,
          lots: decision.addLots,
          fillPrice: fill,
          status: "ACCEPTED",
          brokerOrderId,
          message: "ADD",
        }),
      );
      log(
        "INFO",
        `Scaled in ${decision.addLots}×${pos.lot_size} ${pos.trading_symbol} @ ${fill.toFixed(2)} — ${decision.reason}`,
        pos.underlying,
      );
      track("position_scaled_in", {
        underlying: pos.underlying,
        protocol: pos.protocol,
        mode: currentMode,
        lots: decision.addLots,
      });

      return {
        ok: true,
        message: `Added ${decision.addLots} lot(s) of ${pos.trading_symbol} @ ₹${fill.toLocaleString("en-IN")}.`,
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
   *
   * Two more guards, both Autopilot-only — a manual Execute click is never
   * subject to either:
   *  - One open position at a time, full stop, across every index — not
   *    just the signal's own token. A book that already has a live bet on
   *    doesn't need Autopilot compounding risk into a second, unrelated one
   *    before the first is even settled.
   *  - A 15-minute cooldown per underlying after a TARGET or STOP_LOSS exit
   *    (`autoCooldownUntilRef`, set in `bookExit`) — the protocol just proved
   *    that level wrong or right and settled the trade; re-arming the same
   *    index on the next tick's noise is chasing it, not trading it.
   */
  const autoInFlightRef = useRef<Set<string>>(new Set());
  /**
   * The only trace an Autopilot fill otherwise leaves in the HUD is a log
   * line — the signal panel itself never says a word, since only the manual
   * `execute()` in `SignalPanel` sets its local confirmation banner. Keyed by
   * underlying so `SignalPanel` can look up the one for whichever signal it's
   * currently showing and surface the same banner a manual click would have.
   */
  const [autoFills, setAutoFills] = useState<
    Record<string, { ok: boolean; message: string; ts: number }>
  >({});
  useEffect(() => {
    if (automation !== "auto" || !snapshot) return;
    if (!snapshot.market_open && !simulated) return;
    // One open position at a time, across every index — see this effect's
    // own doc comment above for why. A fill already in flight (about to
    // become an open position, but not yet in `snapshot.ledger` this tick)
    // holds this gate too, not just a settled one.
    if (snapshot.ledger.open_positions.length > 0 || autoInFlightRef.current.size > 0) return;

    const now = Date.now();
    for (const u of UNDERLYINGS) {
      // Re-checked every iteration, not just once above: the moment any
      // underlying in this same pass goes in-flight, nothing else in the
      // pass may fire either — one open position across the whole book, not
      // one per index per tick.
      if (autoInFlightRef.current.size > 0) break;
      const signal = snapshot.signals[u];
      if (!signal?.actionable || !signal.token) continue;
      const cooldownUntil = autoCooldownUntilRef.current[u];
      if (cooldownUntil && now < cooldownUntil) continue;

      autoInFlightRef.current.add(u);
      void executeSignal(u, undefined, "auto")
        .then((res) => {
          setAutoFills((prev) => ({
            ...prev,
            [u]: { ok: res.ok, message: res.message, ts: Date.now() },
          }));
        })
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
    if (open.length) {
      log("PANIC", `Flatten [PANIC] executed across ${open.length} position(s).`);
      track("panic_flatten", { positions: open.length });
    }
  }, [bookExit, log]);

  /**
   * Wipes the DB's paper history first — every paper position and order,
   * open or closed, for this account — and only resets the in-tab ledger
   * once that's confirmed. Doing it the other way round (reset locally,
   * clear the DB best-effort after) would leave a tab reading "fresh start"
   * while a failed clear left the old trades still sitting in Supabase.
   */
  const resetPaper = useCallback(async () => {
    await api.resetPaper();
    ledgerRef.current.reset();
    scaledRef.current.clear();
    scaledInRef.current.clear();
    // Otherwise the next login re-seeds the wallet from the pre-reset
    // checkpoint still sitting in Supabase, silently undoing the reset.
    saveWallet(ledgerRef.current);
    log("INFO", "Paper wallet reset — history cleared, capital back to starting.");
    track("paper_wallet_reset");
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
    trackedTokens: streamRef.current?.trackedCount ?? dhanStreamRef.current?.trackedCount ?? 0,
    tickUpdates: ticksRef.current.updates,
    riskPct: cfgRef.current.riskPct,
    /** Contracts whose COA 2.0 ΔOI is measured from a real session open. */
    oiBaselines: ticksRef.current.baselined,
    /** The board is frozen on a finished session — nothing is being recomputed. */
    settled: settledRef.current,
    focus,
    setFocus: setFocusTracked,
    market,
    login,
    logout,
    refreshProfile,
    setProfile,
    enterDemo,
    switchMode,
    executeSignal,
    autoFills,
    exitPosition,
    scaleOutPosition,
    scaleInPosition,
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
