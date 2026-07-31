"use client";

import { useState } from "react";

import { EngineProvider } from "@/components/EngineProvider";
import { EventLog } from "@/components/EventLog";
import { LoginScreen } from "@/components/LoginScreen";
import { Header } from "@/components/Header";
import { OptionChainMatrix } from "@/components/OptionChainMatrix";
import { OrderBook } from "@/components/OrderBook";
import { RrgScatter } from "@/components/RrgScatter";
import { SignalPanel } from "@/components/SignalPanel";
import type { Underlying } from "@/lib/types";
import { useEngine } from "@/lib/useEngine";

const SIMULATE = process.env.NEXT_PUBLIC_SIMULATE === "1";

export default function TerminalPage() {
  const engine = useEngine(SIMULATE);
  const [selected, setSelected] = useState<Underlying>("NIFTY");
  const [, forceRefresh] = useState(0);

  const { snapshot, streamStatus, simulated, demo, error } = engine;

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

  const degraded = streamStatus === "error" || (!!error && !snapshot?.feed_connected);

  return (
    <EngineProvider engine={engine}>
      <div className="dk-grid-bg flex h-dvh flex-col overflow-hidden">
        <Header
          snapshot={snapshot}
          streamState={streamStatus}
          simulated={simulated}
          selected={selected}
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
          Below xl the terminal is one column that scrolls as a page; from xl it
          becomes a fixed cockpit — nothing scrolls except the matrix body and
          the two panels that opt into it, so the whole HUD stays on one screen.
        */}
        <main className="dk-scroll grid min-h-0 flex-1 grid-cols-1 gap-2 overflow-y-auto p-2 xl:grid-cols-3 xl:overflow-hidden">
          {/* Columns 1 & 2 — the 4-quadrant option chain matrix */}
          <section className="flex min-h-[70vh] flex-col xl:col-span-2 xl:min-h-0 xl:overflow-hidden">
            <OptionChainMatrix chain={chain} signalToken={signal?.token} />
          </section>

          {/*
            Column 3 — Intelligence & Signal HUD. The panels shrink to fit first,
            so on a roomy screen this never scrolls; on a short one (1280×720 and
            below) it scrolls rather than clipping the log out of reach.
          */}
          <aside className="dk-scroll flex min-h-0 flex-col gap-2 xl:overflow-y-auto">
            <RrgScatter nodes={nodes} highlightToken={signal?.token} />
            <SignalPanel
              signal={signal}
              mode={snapshot?.mode ?? "paper"}
              onExecuted={() => forceRefresh((n) => n + 1)}
            />
            <OrderBook
              ledger={snapshot?.ledger}
              onChanged={() => forceRefresh((n) => n + 1)}
            />
            <EventLog events={snapshot?.events ?? []} />
          </aside>
        </main>

        <footer className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 px-3 py-1 text-[9px] uppercase tracking-wider text-zinc-600">
          <span>
            Delta-K Matrix Strategy · COA 1.0 / 2.0 · RRG Multi-Strike Momentum
          </span>
          <span className="flex items-center gap-3">
            <span>Tokens {engine.trackedTokens}</span>
            <span>Ticks {engine.tickUpdates}</span>
            <span>Risk {engine.riskPct}%</span>
            <span>{snapshot?.ts?.slice(11, 19) ?? "--:--:--"}</span>
          </span>
        </footer>
      </div>
    </EngineProvider>
  );
}
