"use client";

import { useState } from "react";

import { EngineProvider } from "@/components/EngineProvider";
import { LoginScreen } from "@/components/LoginScreen";
import { Header } from "@/components/Header";
import { CoaMatrixPanel } from "@/components/hero/CoaMatrixPanel";
import { QuantumHorizon } from "@/components/hero/QuantumHorizon";
import { OiBuildupPanel } from "@/components/OiBuildupPanel";
import { OptionChainMatrix } from "@/components/OptionChainMatrix";
import { RrgScatter } from "@/components/RrgScatter";
import { SignalPanel } from "@/components/SignalPanel";
import { TradeBook } from "@/components/TradeBook";
import type { Underlying } from "@/lib/types";
import { useEngine } from "@/lib/useEngine";

const SIMULATE = process.env.NEXT_PUBLIC_SIMULATE === "1";

export default function TerminalPage() {
  const engine = useEngine(SIMULATE);
  // Selection lives in the engine: the historical fetches are scoped to it.
  const selected = engine.focus;
  const setSelected = engine.setFocus;
  const [, forceRefresh] = useState(0);

  const { snapshot, streamStatus, simulated, demo, error, market } = engine;

  // An empty terminal is worse than no terminal: without a feed there is nothing
  // to render and no circuit breaker can act, so gate on a live session.
  if (!engine.session.authenticated && !demo) {
    return (
      <EngineProvider engine={engine}>
        <LoginScreen simulate={SIMULATE} />
      </EngineProvider>
    );
  }

  const chain = snapshot?.chains[selected];
  const signal = snapshot?.signals[selected];
  const nodes = snapshot?.rrg[selected] ?? [];
  const quote = snapshot?.spots[selected];

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
          onRefreshStatus={() => forceRefresh((n) => n + 1)}
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
          becomes a fixed cockpit: a three-column hero over the chain and the
          trade book, with only the panels that opt in scrolling internally.
        */}
        <div className="dk-scroll flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2 xl:overflow-hidden">
          {/* Hero — levels, price, rotation */}
          <section className="grid shrink-0 grid-cols-1 gap-2 lg:grid-cols-3">
            <CoaMatrixPanel
              chain={chain}
              aegisOi={aegisToken ? market.oiSeries[aegisToken] : undefined}
              zenithOi={zenithToken ? market.oiSeries[zenithToken] : undefined}
              marketPcr={market.pcr[selected] ?? null}
            />
            <QuantumHorizon
              chain={chain}
              quote={quote}
              candles={market.candles}
              stats={market.stats}
            />
            <RrgScatter nodes={nodes} highlightToken={signal?.token} signal={signal} />
          </section>

          {/* Board — the chain, and everything that acts on it */}
          <section className="grid min-h-0 flex-1 grid-cols-1 gap-2 xl:grid-cols-3 xl:overflow-hidden">
            <div className="flex min-h-[60vh] flex-col xl:col-span-2 xl:min-h-0 xl:overflow-hidden">
              <OptionChainMatrix chain={chain} signalToken={signal?.token} />
            </div>

            <aside className="dk-scroll flex min-h-0 flex-col gap-2 xl:overflow-y-auto">
              <SignalPanel
                signal={signal}
                mode={snapshot?.mode ?? "paper"}
                onExecuted={() => forceRefresh((n) => n + 1)}
              />
              <TradeBook
                ledger={snapshot?.ledger}
                onChanged={() => forceRefresh((n) => n + 1)}
              />
              <OiBuildupPanel
                rows={market.buildup}
                type={market.buildupType}
                expiry={market.buildupExpiry}
                updatedAt={market.buildupAt}
                available={market.available}
                focus={selected}
                onType={market.setBuildupType}
                onExpiry={market.setBuildupExpiry}
              />
            </aside>
          </section>
        </div>

        <footer className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 px-3 py-1 text-[9px] uppercase tracking-wider text-zinc-600">
          <span className="flex items-center gap-3">
            <span>
              Delta-K Matrix Strategy · COA 1.0 / 2.0 · RRG Multi-Strike Momentum
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
            <span>Risk {engine.riskPct}%</span>
            {/* The clock lives in the header, in IST — one authoritative time. */}
            <span>{snapshot?.mode === "live" ? "Live routing" : "Paper ledger"}</span>
          </span>
        </footer>
      </div>
    </EngineProvider>
  );
}
