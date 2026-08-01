"use client";

import { AlertOctagon, Loader2, Scissors, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { CardContent } from "@/components/ui/card";
import { useEngineContext } from "@/components/EngineProvider";
import type { LedgerSnapshot, Position } from "@/lib/types";
import { cn, fmt, money, pnlTone, signedMoney } from "@/lib/utils";

type Tab = "open" | "history";

/** Why a position left the book, in the operator's language. */
const EXIT_REASON: Record<string, string> = {
  MANUAL: "Closed",
  TP1: "Scaled",
  TARGET: "Target",
  STOP_LOSS: "Stopped",
  DAYLIGHT_REST: "Rest",
  PANIC: "Flatten",
  INVALIDATION: "Invalid",
};

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="min-w-0 rounded border border-zinc-800 bg-zinc-950/50 px-1.5 py-1">
      <div className="dk-label text-[9px] leading-none">{label}</div>
      <div
        className={cn(
          "mt-1 truncate font-mono text-[11px] font-semibold leading-none",
          tone ?? "text-zinc-100",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function Symbol({ position }: { position: Position }) {
  return (
    <td className="px-1 py-1 text-left">
      <div className="truncate font-mono text-[10px] font-semibold text-zinc-200">
        {position.trading_symbol}
      </div>
      <div className="font-mono text-[9px] text-zinc-600">
        {position.lots} lot{position.lots === 1 ? "" : "s"}
        {position.protocol ? ` · ${position.protocol.charAt(0)}` : ""}
      </div>
    </td>
  );
}

export function TradeBook({
  ledger,
  onChanged,
}: {
  ledger: LedgerSnapshot | undefined;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("open");
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmPanic, setConfirmPanic] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const engine = useEngineContext();

  if (!ledger) {
    return (
      <CardContent className="flex items-center justify-center text-xs text-zinc-600">
        Ledger loading…
      </CardContent>
    );
  }

  async function run(key: string, fn: () => Promise<unknown>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Action failed");
      setTimeout(() => setError(null), 6000);
    } finally {
      setBusy(null);
    }
  }

  const open = ledger.open_positions;
  // Newest first: the trade you just closed is the one you want to see.
  const closed = [...ledger.closed_positions].reverse();
  const rows = tab === "open" ? open : closed;

  return (
    // Body only: the deck owns the card, the title and the tab strip. The book
    // and the signal engine are two views of one position — what to take, and
    // what is already on — so they share a frame.
    <>
      <CardContent className="dk-scroll min-h-0 space-y-2 overflow-y-auto p-2">
        <div className="grid grid-cols-4 gap-1">
          <Metric label="Equity" value={money(ledger.equity, 0)} />
          <Metric
            label="Open"
            value={signedMoney(ledger.open_pnl, 0)}
            tone={pnlTone(ledger.open_pnl)}
          />
          <Metric
            label="Booked"
            value={signedMoney(ledger.realised_pnl, 0)}
            tone={pnlTone(ledger.realised_pnl)}
          />
          <Metric
            label="Deployed"
            value={money(ledger.deployed_margin, 0)}
            tone="text-zinc-300"
          />
        </div>

        {/* Open / history */}
        <div className="flex items-center gap-1">
          {(
            [
              ["open", "Open", open.length],
              ["history", "History", closed.length],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-colors",
                tab === key
                  ? "border-quantum/60 bg-quantum/15 text-quantum"
                  : "border-zinc-800 text-zinc-500 hover:text-zinc-300",
              )}
            >
              {label}
              <span className="opacity-70">{count}</span>
            </button>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="py-5 text-center text-[11px] text-zinc-600">
            {tab === "open" ? "No open positions." : "No closed trades yet."}
          </div>
        ) : (
          <div className="dk-scroll overflow-x-auto">
            <table className="w-full border-collapse text-right">
              <thead className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur">
                <tr className="text-[9px] uppercase tracking-wider text-zinc-600">
                  <th className="px-1 py-1 text-left font-medium">Symbol</th>
                  <th className="px-1 py-1 font-medium">Qty</th>
                  <th className="px-1 py-1 font-medium">Avg</th>
                  <th className="px-1 py-1 font-medium">
                    {tab === "open" ? "LTP" : "Exit"}
                  </th>
                  <th className="px-1 py-1 font-medium">
                    {tab === "open" ? "SL" : "Why"}
                  </th>
                  <th className="px-1 py-1 font-medium">PnL</th>
                  {tab === "open" ? <th className="px-1 py-1" /> : null}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const pnl =
                    tab === "open" ? p.unrealised_pnl : p.realised_pnl;
                  return (
                    <tr
                      key={p.id}
                      className="border-t border-zinc-800/60 hover:bg-zinc-800/30"
                    >
                      <Symbol position={p} />
                      <td className="px-1 py-1 font-mono text-[10px] text-zinc-400">
                        {p.quantity}
                      </td>
                      <td className="px-1 py-1 font-mono text-[10px] text-zinc-400">
                        {fmt(p.avg_price)}
                      </td>
                      <td className="px-1 py-1 font-mono text-[10px] text-zinc-200">
                        {tab === "open"
                          ? fmt(p.ltp)
                          : p.exit_price !== null
                            ? fmt(p.exit_price)
                            : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-1 py-1 font-mono text-[10px]",
                          tab === "open"
                            ? "text-rose-400/80"
                            : "text-zinc-500",
                        )}
                      >
                        {tab === "open"
                          ? p.stop_loss !== null
                            ? fmt(p.stop_loss)
                            : "—"
                          : p.exit_reason
                            ? (EXIT_REASON[p.exit_reason] ?? p.exit_reason)
                            : "—"}
                      </td>
                      <td
                        className={cn(
                          "px-1 py-1 font-mono text-[10px] font-semibold",
                          pnlTone(pnl),
                        )}
                      >
                        <div>{signedMoney(pnl, 0)}</div>
                        <div className="text-[9px] opacity-75">
                          {p.pnl_pct > 0 ? "+" : ""}
                          {fmt(p.pnl_pct, 1)}%
                        </div>
                      </td>
                      {tab === "open" ? (
                        <td className="px-1 py-1">
                          <div className="flex items-center justify-end gap-0.5">
                            <button
                              title="Scale out 50% (TP1)"
                              aria-label={`Scale out ${p.trading_symbol}`}
                              disabled={busy !== null || p.lots < 2}
                              onClick={() =>
                                run(`s-${p.id}`, () =>
                                  engine.scaleOutPosition(p.id),
                                )
                              }
                              className="rounded p-1 text-amber-400/80 transition-colors hover:bg-amber-500/15 hover:text-amber-300 disabled:opacity-30"
                            >
                              {busy === `s-${p.id}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Scissors className="h-3 w-3" />
                              )}
                            </button>
                            <button
                              title="Close position"
                              aria-label={`Close ${p.trading_symbol}`}
                              disabled={busy !== null}
                              onClick={() =>
                                run(`x-${p.id}`, () => engine.exitPosition(p.id))
                              }
                              className="rounded p-1 text-rose-400/80 transition-colors hover:bg-rose-500/15 hover:text-rose-300 disabled:opacity-30"
                            >
                              {busy === `x-${p.id}` ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <X className="h-3 w-3" />
                              )}
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {error ? (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300">
            {error}
          </div>
        ) : null}
      </CardContent>

      <div className="shrink-0 border-t border-zinc-800/70 p-2">
        {confirmPanic ? (
          <div className="flex items-center gap-2 rounded border border-rose-500/50 bg-rose-500/10 p-2">
            <span className="flex-1 text-[10px] leading-snug text-rose-200">
              Flatten all {open.length} position{open.length === 1 ? "" : "s"} at
              market?
            </span>
            <Button
              variant="danger"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                run("panic", async () => {
                  await engine.panicFlatten();
                  setConfirmPanic(false);
                })
              }
            >
              {busy === "panic" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : null}
              Confirm
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmPanic(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="danger"
            className="w-full"
            disabled={open.length === 0}
            onClick={() => setConfirmPanic(true)}
          >
            <AlertOctagon className="h-3.5 w-3.5" />
            Panic Flatten
          </Button>
        )}
      </div>
    </>
  );
}
