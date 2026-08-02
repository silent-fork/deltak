"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { BootScreen } from "@/components/BootScreen";
import { EngineProvider } from "@/components/EngineProvider";
import { LoginScreen } from "@/components/LoginScreen";
import { Header } from "@/components/Header";
import { CoaMatrixPanel } from "@/components/hero/CoaMatrixPanel";
import { QuantumHorizon } from "@/components/hero/QuantumHorizon";
import { OptionChainMatrix } from "@/components/OptionChainMatrix";
import { RrgScatter } from "@/components/RrgScatter";
import { SignalDeck } from "@/components/SignalDeck";
import {
  reconstructWallTrail,
  spotAtFactory,
} from "@/lib/market/migration";
import type { Underlying } from "@/lib/types";
import { useEngine } from "@/lib/useEngine";

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
   * session check has settled, real data gets a few seconds to show up before
   * this falls through to the dashboard's own per-panel skeletons regardless.
   */
  const [dataTimedOut, setDataTimedOut] = useState(false);
  useEffect(() => {
    if (!engine.sessionChecked || dataTimedOut) return;
    const id = setTimeout(() => setDataTimedOut(true), 4000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.sessionChecked]);

  /**
   * Every panel but RRG gates its own paint on this same tick's data, just on
   * different thresholds: COA Matrix and the option chain both need one built
   * strike row, Quantum Horizon's profile needs two (a single strike can't
   * plot a spread), and the signal deck needs a signal — which only exists
   * once the engine has evaluated *a* chain for this underlying, so it never
   * lags `chain` by more than the same tick. Combining them is what makes one
   * boot screen stand in for all four instead of each painting on its own
   * schedule a second or two apart.
   *
   * RRG is deliberately left out: it has its own translucent "maturing"
   * overlay for the long tail of nodes that seed in over several ticks, and
   * gating the whole board on that would hold the boot screen up long after
   * everything else is real.
   */
  const dataReady = !!chain && chain.rows.length >= 2 && !!signal;
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
      <div className="dk-grid-bg flex h-dvh flex-col overflow-hidden">
        <Header
          snapshot={snapshot}
          streamState={streamStatus}
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
            />
            <QuantumHorizon
              chain={chain}
              quote={quote}
              candles={market.candles}
              stats={market.stats}
            />
            <RrgScatter
              nodes={nodes}
              highlightToken={signal?.token}
              signal={signal}
              settled={engine.settled}
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
                onLedgerChanged={bumpRefresh}
              />
            </aside>
          </section>
        </div>

        <footer className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 px-3 py-0.5 text-[9px] uppercase tracking-wider text-zinc-600">
          <span className="flex items-center gap-3">
            <span>
              DeltaK Matrix Strategy · COA 1.0 / 2.0 · RRG Multi-Strike Momentum
            </span>
            {/* Historical reads are an enhancement, never a dependency — say so
                here rather than raising the degraded banner over them. */}
            {market.error ? (
              <span className="text-amber-500/80" title={market.error}>
                Historical data degraded
              </span>
            ) : null}
          </span>
          <span className="flex items-center gap-3">
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
            <span>{snapshot?.mode === "live" ? "Live routing" : "Paper ledger"}</span>
          </span>
        </footer>
      </div>
    </EngineProvider>
  );
}
