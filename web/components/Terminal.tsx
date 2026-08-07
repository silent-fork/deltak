"use client";

import { Heart } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { BootScreen } from "@/components/BootScreen";
import { EngineProvider } from "@/components/EngineProvider";
import { LoginScreen } from "@/components/LoginScreen";
import { Header } from "@/components/Header";
import { CoaMatrixPanel } from "@/components/hero/CoaMatrixPanel";
import { QuantumHorizon } from "@/components/hero/QuantumHorizon";
import { OptionChainMatrix } from "@/components/OptionChainMatrix";
import { RrgScatter } from "@/components/RrgScatter";
import { SignalDeck } from "@/components/SignalDeck";
import { DEFAULT_CONFIG, INDEX_UNIVERSE } from "@/lib/engine/config";
import {
  reconstructWallTrail,
  spotAtFactory,
} from "@/lib/market/migration";
import type { Underlying } from "@/lib/types";
import { useEngine } from "@/lib/useEngine";
import { fmt } from "@/lib/utils";

const SIMULATE = process.env.NEXT_PUBLIC_SIMULATE === "1";

export function Terminal() {
  const engine = useEngine(SIMULATE);
  // Selection lives in the engine: the historical fetches are scoped to it.
  const selected = engine.focus;
  const setSelected = engine.setFocus;
  const [, forceRefresh] = useState(0);
  /**
   * One stable identity for "something outside the engine loop happened, redraw."
   * Handed to the memoized panels below as-is — a fresh arrow function on every
   * render would defeat their `React.memo` the moment any of them took it as a
   * prop, since a new function is never `===` the last one.
   */
  const bumpRefresh = useCallback(() => forceRefresh((n) => n + 1), []);

  const { snapshot, streamStatus, simulated, demo, error, market } = engine;

  const chain = snapshot?.chains[selected];
  const signal = snapshot?.signals[selected];
  const nodes = snapshot?.rrg[selected] ?? [];
  const quote = snapshot?.spots[selected];

  /**
   * Whether RRG should say "market closed" — the exchange's own clock, not
   * `engine.settled`. `settled` means "nothing changed this exact tick",
   * which stays false for as long as session-seeding or closed-market replay
   * is still trickling data in after the bell, so using it here left the RRG
   * panel sitting on its "still maturing" state for a stretch after close
   * instead of admitting immediately that there is no rotation to show.
   */
  const marketClosedForRotation = !simulated && !(snapshot?.market_open ?? false);

  /**
   * COA Matrix and Quantum Horizon both draw part of their picture from the
   * historical enrichment `useMarketData` keeps only for the focused
   * underlying — switching drops its candles and OI series the instant the
   * focus changes (a trace spliced across two instruments is worse than no
   * trace), so those two panels would otherwise flash back to their
   * "awaiting history" placeholders for however long the refetch takes, even
   * though the chain, the signal and the RRG nodes for the new underlying
   * were already live the moment the header switched it — the engine ticks
   * every underlying every second regardless of which one is on screen. A
   * translucent scrim over just those two panels covers that gap instead of
   * the rest of the board looking like it forgot anything.
   *
   * The same gap exists once more, on the very first reveal — see the second
   * effect below.
   */
  const [switchingFocus, setSwitchingFocus] = useState(false);
  const priorFocusRef = useRef(selected);
  useEffect(() => {
    const changed = priorFocusRef.current !== selected;
    priorFocusRef.current = selected;
    // Demo/simulated sessions never populate `market` in the first place —
    // nothing to wait on, so nothing should spin.
    if (changed && market.available) setSwitchingFocus(true);
  }, [selected, market.available]);
  // The same gap exists once, on the very first reveal: `market.available`
  // flips true the moment a real session lands, and its candles/OI series
  // start their own fetch right then — a beat behind the tick-driven
  // `dataReady` gate above. Reusing the same scrim here means the board's
  // first paint and an underlying switch look like the same, already-solved
  // problem instead of two.
  const priorMarketAvailableRef = useRef(market.available);
  useEffect(() => {
    const becameAvailable = !priorMarketAvailableRef.current && market.available;
    priorMarketAvailableRef.current = market.available;
    if (becameAvailable && market.candles.length === 0) setSwitchingFocus(true);
  }, [market.available, market.candles.length]);
  useEffect(() => {
    if (!switchingFocus) return;
    if (market.candles.length > 0) {
      setSwitchingFocus(false);
      return;
    }
    // Safety valve, same reasoning as the boot sequence's: a slow or dead
    // history fetch must not leave the scrim up over a panel that is
    // otherwise perfectly fine to read.
    const id = setTimeout(() => setSwitchingFocus(false), 5000);
    return () => clearTimeout(id);
  }, [switchingFocus, market.candles.length]);

  /**
   * The walls' actual path through the session, rebuilt from the open-interest
   * series already in hand. The engine's own trail only covers the time this
   * tab has been open, so this replaces it whenever history reaches further.
   *
   * Every hook stays above the sign-in gate below — a hook that runs only once
   * the terminal is unlocked changes the hook count mid-life and tears React's
   * state apart at exactly the moment the operator signs in.
   */
  const rows = chain?.rows;
  const historicalTrail = useMemo(() => {
    if (!rows?.length || !market.candles.length) return null;
    const trail = reconstructWallTrail(
      rows.map((r) => ({
        strike: r.strike,
        callToken: r.call?.token,
        putToken: r.put?.token,
      })),
      market.oiSeries,
      spotAtFactory(market.candles),
    );
    return trail.times.length > 1 ? trail : null;
  }, [rows, market.oiSeries, market.candles]);

  /**
   * The boot sequence's safety valve. Session check and the scrip master both
   * always settle (each catches its own errors), but live chain data never
   * comes with that guarantee — a dead feed or a market that never opens
   * today would otherwise leave the boot screen spinning forever. Once the
   * session check has settled, real data gets a stretch of time to show up
   * before this falls through to the dashboard's own per-panel skeletons
   * regardless. Wide enough to cover the WS feed actually ticking most of a
   * fresh chain's strikes, which is the slow part of the boot, not a guess at
   * "a few seconds."
   */
  const [dataTimedOut, setDataTimedOut] = useState(false);
  useEffect(() => {
    if (!engine.sessionChecked || dataTimedOut) return;
    const id = setTimeout(() => setDataTimedOut(true), 8000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.sessionChecked]);

  /**
   * `chain.rows` exists the instant the scrip master builds the strike ladder
   * — every row's `oi`/`volume`/`ltp` only ever come from a live WS tick, and
   * start at zero, so a row count alone says nothing about whether the feed
   * has actually quoted anything yet. This is the same fraction RRG and
   * Quantum Horizon each compute internally to decide when their own
   * "maturing" overlays can drop; the boot screen needs the same bar so it
   * doesn't hand off to the board before those overlays already would.
   *
   * Scoped to the same near-ATM span RRG plots from (`rrgNodeSpan`), not the
   * full rendered ladder (`chainDepth`, roughly double that span each side):
   * counting every strike out to the wings meant this could go unreached for
   * strikes that never trade all session, and the gate was falling through
   * to its own timeout on every load instead of ever actually turning true —
   * which is exactly what left the board revealing before COA Matrix and
   * Quantum Horizon had anything real. The wings staying at zero once the
   * near-ATM legs are quoted is thin liquidity, not this panel still loading.
   */
  const LEG_READY_FRACTION = 0.9;
  const legMaturity = useMemo(() => {
    if (!chain?.rows.length) return { matured: 0, expected: 0 };
    const spec = INDEX_UNIVERSE[chain.underlying];
    const span = spec ? spec.strikeStep * DEFAULT_CONFIG.rrgNodeSpan : Infinity;
    let matured = 0;
    let expected = 0;
    for (const row of chain.rows) {
      if (Math.abs(row.strike - chain.atm_strike) > span) continue;
      if (row.call) {
        expected += 1;
        if (row.call.oi > 0) matured += 1;
      }
      if (row.put) {
        expected += 1;
        if (row.put.oi > 0) matured += 1;
      }
    }
    return { matured, expected };
  }, [chain]);
  const legsReady =
    legMaturity.expected > 0 &&
    legMaturity.matured >= Math.ceil(legMaturity.expected * LEG_READY_FRACTION);

  /**
   * Every panel but RRG gates its own paint on this same tick's data, just on
   * different thresholds: COA Matrix and the option chain both need one built
   * strike row, Quantum Horizon's profile needs two (a single strike can't
   * plot a spread), and the signal deck needs a signal — which only exists
   * once the engine has evaluated *a* chain for this underlying, so it never
   * lags `chain` by more than the same tick. `legsReady` on top of all that
   * is what actually keeps the boot screen up until the numbers in those
   * panels are real, not just a ladder of strikes with every cell reading
   * zero. Combining them is what makes one boot screen stand in for all four
   * instead of each painting on its own schedule a second or two apart.
   *
   * RRG is deliberately left out: it has its own translucent "maturing"
   * overlay for the long tail of nodes that seed in over several ticks, and
   * gating the whole board on that would hold the boot screen up long after
   * everything else is real.
   */
  const dataReady = !!chain && chain.rows.length >= 2 && !!signal && legsReady;
  const bootStages = [
    { done: engine.sessionChecked },
    { done: engine.masterReady },
    { done: dataReady },
  ];

  // Before the session check settles, "not authenticated" and "haven't
  // checked yet" must not read as the same thing — that's what put the
  // sign-in screen on a fully signed-in operator's tab for one frame on every
  // reload.
  if (!engine.sessionChecked) {
    return (
      <EngineProvider engine={engine}>
        <BootScreen stages={bootStages} />
      </EngineProvider>
    );
  }

  // An empty terminal is worse than no terminal: without a feed there is nothing
  // to render and no circuit breaker can act, so gate on a live session.
  if (!engine.session.authenticated && !demo) {
    return (
      <EngineProvider engine={engine}>
        <LoginScreen simulate={SIMULATE} />
      </EngineProvider>
    );
  }

  // Signed in, but the board hasn't painted anything real yet — one boot
  // screen instead of a patchwork of independent panel skeletons filling in
  // over the next second or two.
  if (!dataReady && !dataTimedOut) {
    return (
      <EngineProvider engine={engine}>
        <BootScreen stages={bootStages} />
      </EngineProvider>
    );
  }

  // The wall contracts, so the COA panel can draw each wall's OI history.
  const rowAt = (strike: number | null | undefined) =>
    strike === null || strike === undefined
      ? undefined
      : chain?.rows.find((r) => r.strike === strike);
  const aegisToken = rowAt(chain?.levels.aegis_1)?.put?.token;
  const zenithToken = rowAt(chain?.levels.zenith_1)?.call?.token;

  const degraded = streamStatus === "error" || (!!error && !snapshot?.feed_connected);

  return (
    <EngineProvider engine={engine}>
      <div className="dk-grid-bg relative flex h-dvh flex-col overflow-hidden bg-zinc-950">
        {/* The same top-lit glow the homepage's hero and the boot sequence
            both sit under — dimmer here, since it has to sit behind a dense
            header and cards rather than open space, but it's what ties the
            terminal back to the rest of the product instead of reading as a
            separate, plainer app once you're past the sign-in screen. */}
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 h-[360px] w-[900px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-quantum/[0.05] blur-[140px]"
        />
        <Header
          snapshot={snapshot}
          simulated={simulated}
          selected={selected}
          events={snapshot?.events ?? []}
          onSelect={(u) => setSelected(u as Underlying)}
          onRefreshStatus={bumpRefresh}
        />

        {degraded ? (
          <div className="flex items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-300">
            <span>
              {error ??
                "Market feed disconnected — the data below is frozen. Circuit breakers cannot act without ticks."}
            </span>
            <button
              onClick={() => void engine.reloadMaster()}
              className="rounded border border-amber-500/50 px-2 py-0.5 text-[10px] uppercase tracking-wider hover:bg-amber-500/20"
            >
              Retry
            </button>
          </div>
        ) : null}

        {/*
          Below xl the terminal is one column that scrolls as a page. From xl it
          becomes a fixed cockpit split two parts hero to three parts board — the
          hero is context you read at a glance, the board is what you act on, so
          the board gets the larger share and only opted-in panels scroll.
        */}
        <div className="dk-scroll flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5 xl:overflow-hidden">
          {/* Hero — levels, price, rotation */}
          <section className="grid shrink-0 grid-cols-1 gap-1.5 lg:grid-cols-3 xl:min-h-0 xl:shrink xl:basis-0 xl:grow-[2]">
            <CoaMatrixPanel
              chain={chain}
              aegisOi={aegisToken ? market.oiSeries[aegisToken] : undefined}
              zenithOi={zenithToken ? market.oiSeries[zenithToken] : undefined}
              marketPcr={market.pcr[selected] ?? null}
              aegisTrail={historicalTrail?.aegis}
              zenithTrail={historicalTrail?.zenith}
              switching={switchingFocus}
            />
            <QuantumHorizon
              chain={chain}
              quote={quote}
              candles={market.candles}
              stats={market.stats}
              switching={switchingFocus}
            />
            <RrgScatter
              nodes={nodes}
              highlightToken={signal?.token}
              signal={signal}
              settled={marketClosedForRotation}
              asOf={market.stats?.date ?? null}
              chain={chain}
            />
          </section>

          {/* Board — the chain, and everything that acts on it */}
          <section className="grid min-h-0 flex-1 grid-cols-1 gap-1.5 xl:basis-0 xl:grow-[3] xl:grid-cols-3 xl:overflow-hidden">
            <div className="flex min-h-[60vh] flex-col xl:col-span-2 xl:min-h-0 xl:overflow-hidden">
              <OptionChainMatrix chain={chain} signalToken={signal?.token} />
            </div>

            {/* One panel: the signal engine and the trade book, tabbed. */}
            <aside className="flex min-h-0 flex-col xl:overflow-hidden">
              <SignalDeck
                signal={signal}
                mode={snapshot?.mode ?? "paper"}
                chain={chain}
                onExecuted={bumpRefresh}
                ledger={snapshot?.ledger}
                scaleIn={snapshot?.scale_in ?? {}}
                onLedgerChanged={bumpRefresh}
                clientCode={engine.session.clientCode}
                walletResetAt={engine.walletResetAt}
              />
            </aside>
          </section>
        </div>

        <footer className="shrink-0 grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-t border-zinc-800 px-3 py-0.5 text-[9px] uppercase tracking-wider text-zinc-600">
          <span className="flex min-w-0 flex-wrap items-center gap-3">
            {/* What the board below is actually keyed to, in one glance — a
                live readout instead of a static brand line, so switching
                instruments or the PCR moving is legible from the footer alone. */}
            <span
              className="truncate"
              title="DeltaK Matrix Strategy — COA 1.0/2.0 wall reads plus RRG multi-strike momentum."
            >
              DKMS · {chain?.label ?? selected}
              {chain?.expiry ? ` · ${chain.expiry}` : ""} · PCR{" "}
              {chain ? fmt(chain.pcr) : "—"}
            </span>
            {/* Historical reads are an enhancement, never a dependency — say so
                here rather than raising the degraded banner over them. */}
            {market.error ? (
              <span className="text-amber-500/80" title={market.error}>
                Historical data degraded
              </span>
            ) : null}
          </span>

          <span className="flex shrink-0 items-center justify-center gap-1 whitespace-nowrap text-zinc-700">
            Made with{" "}
            <Heart
              aria-hidden
              className="h-2.5 w-2.5 fill-rose-500/70 text-rose-500/70"
            />{" "}
            in Bharat
          </span>

          <span className="flex min-w-0 flex-wrap items-center justify-end gap-3">
            <span>Tokens {engine.trackedTokens}</span>
            <span>Ticks {engine.tickUpdates}</span>
            <span
              title="Contracts whose COA 2.0 ΔOI is measured against the exchange's own session-open open interest, rather than the first frame this tab received."
            >
              OI base {engine.oiBaselines}
            </span>
            {engine.settled ? (
              <span
                title="Nothing is being recomputed: the exchange is closed and the board is frozen on the last session. The rotation windows and wall trail hold their replayed history until the next print."
                className="text-quantum/70"
              >
                Settled
              </span>
            ) : null}
            {market.replayed > 0 ? (
              <span
                title="Contracts whose last session was replayed from historical candles because the market is closed — prices and rotation are Friday's, not live."
                className="text-zinc-500"
              >
                Replay {market.replayed}
              </span>
            ) : null}
            <span>Risk {engine.riskPct}%</span>
            {/* The clock lives in the header, in IST — one authoritative time. */}
            <span>Paper ledger</span>
          </span>
        </footer>
      </div>
    </EngineProvider>
  );
}
