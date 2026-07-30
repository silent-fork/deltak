"use client";

import { useCallback, useEffect, useState } from "react";

import { EventLog } from "@/components/EventLog";
import { Header } from "@/components/Header";
import { OptionChainMatrix } from "@/components/OptionChainMatrix";
import { OrderBook } from "@/components/OrderBook";
import { RrgScatter } from "@/components/RrgScatter";
import { SignalPanel } from "@/components/SignalPanel";
import { api } from "@/lib/api";
import type { EngineStatus, Underlying } from "@/lib/types";
import { useEngineStream } from "@/lib/useEngine";

export default function TerminalPage() {
  const { snapshot, state, stale, reconnect } = useEngineStream();
  const [selected, setSelected] = useState<Underlying>("NIFTY");
  const [status, setStatus] = useState<EngineStatus | null>(null);

  const refreshStatus = useCallback(() => {
    api
      .status()
      .then(setStatus)
      .catch(() => setStatus(null));
  }, []);

  useEffect(() => {
    refreshStatus();
    const id = setInterval(refreshStatus, 20000);
    return () => clearInterval(id);
  }, [refreshStatus]);

  const chain = snapshot?.chains[selected];
  const signal = snapshot?.signals[selected];
  const nodes = snapshot?.rrg[selected] ?? [];

  return (
    <div className="dk-grid-bg flex min-h-screen flex-col">
      <Header
        snapshot={snapshot}
        streamState={state}
        simulated={status?.simulated ?? false}
        selected={selected}
        onSelect={(u) => setSelected(u as Underlying)}
        onRefreshStatus={refreshStatus}
      />

      {stale || state === "error" ? (
        <div className="flex items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/10 px-3 py-1 text-[11px] text-amber-300">
          <span>
            {state === "error"
              ? "Engine stream lost — the data below is frozen."
              : "No frame received recently — the data below may be stale."}
          </span>
          <button
            onClick={reconnect}
            className="rounded border border-amber-500/50 px-2 py-0.5 text-[10px] uppercase tracking-wider hover:bg-amber-500/20"
          >
            Reconnect
          </button>
        </div>
      ) : null}

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-2 p-2 xl:grid-cols-3">
        {/* Columns 1 & 2 — the 4-quadrant option chain matrix */}
        <section className="min-h-0 xl:col-span-2">
          <OptionChainMatrix chain={chain} signalToken={signal?.token} />
        </section>

        {/* Column 3 — Intelligence & Signal HUD */}
        <aside className="flex min-h-0 flex-col gap-2 overflow-y-auto">
          <RrgScatter nodes={nodes} highlightToken={signal?.token} />
          <SignalPanel
            signal={signal}
            mode={snapshot?.mode ?? "paper"}
            onExecuted={refreshStatus}
          />
          <OrderBook ledger={snapshot?.ledger} onChanged={refreshStatus} />
          <EventLog events={snapshot?.events ?? []} />
        </aside>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 px-3 py-1 text-[9px] uppercase tracking-wider text-zinc-600">
        <span>
          Delta-K Matrix Strategy · COA 1.0 / 2.0 · RRG Multi-Strike Momentum
        </span>
        <span className="flex items-center gap-3">
          <span>Tokens {status?.tracked_tokens ?? 0}</span>
          <span>Ticks {status?.tick_updates ?? 0}</span>
          <span>Risk {status?.risk_pct ?? "—"}%</span>
          <span>{snapshot?.ts?.slice(11, 19) ?? "--:--:--"}</span>
        </span>
      </footer>
    </div>
  );
}
