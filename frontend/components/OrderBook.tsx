"use client";

import { AlertOctagon, Loader2, Scissors, X } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api";
import type { LedgerSnapshot } from "@/lib/types";
import { cn, fmt, money, pnlTone, signedMoney } from "@/lib/utils";

export function OrderBook({
  ledger,
  onChanged,
}: {
  ledger: LedgerSnapshot | undefined;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmPanic, setConfirmPanic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!ledger) {
    return (
      <Card className="shrink-0">
        <CardContent className="py-6 text-center text-xs text-zinc-600">
          Ledger loading…
        </CardContent>
      </Card>
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

  const positions = ledger.open_positions;

  return (
    <Card className="shrink-0">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Order Book</CardTitle>
          <Badge
            className={cn(
              "font-semibold",
              ledger.mode === "live"
                ? "border-rose-500/50 bg-rose-500/10 text-rose-300"
                : "border-zinc-700 text-zinc-400",
            )}
          >
            {ledger.mode}
          </Badge>
        </div>
        <span className={cn("font-mono text-xs font-bold", pnlTone(ledger.total_pnl))}>
          {signedMoney(ledger.total_pnl)}
        </span>
      </CardHeader>

      <CardContent className="space-y-2 p-2">
        {/* Portfolio strip */}
        <div className="grid grid-cols-4 gap-1">
          {[
            { label: "Equity", value: money(ledger.equity, 0), tone: "text-zinc-100" },
            {
              label: "Open",
              value: signedMoney(ledger.open_pnl, 0),
              tone: pnlTone(ledger.open_pnl),
            },
            {
              label: "Booked",
              value: signedMoney(ledger.realised_pnl, 0),
              tone: pnlTone(ledger.realised_pnl),
            },
            {
              label: "Deployed",
              value: money(ledger.deployed_margin, 0),
              tone: "text-zinc-300",
            },
          ].map((m) => (
            <div
              key={m.label}
              className="rounded border border-zinc-800 bg-zinc-950/50 px-1.5 py-1"
            >
              <div className="dk-label">{m.label}</div>
              <div className={cn("mt-0.5 font-mono text-[11px] font-semibold", m.tone)}>
                {m.value}
              </div>
            </div>
          ))}
        </div>

        {/* Positions */}
        {positions.length === 0 ? (
          <div className="py-5 text-center text-[11px] text-zinc-600">
            No open positions.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-right">
              <thead>
                <tr className="text-[9px] uppercase tracking-wider text-zinc-600">
                  <th className="px-1 py-1 text-left font-medium">Symbol</th>
                  <th className="px-1 py-1 font-medium">Qty</th>
                  <th className="px-1 py-1 font-medium">Avg</th>
                  <th className="px-1 py-1 font-medium">LTP</th>
                  <th className="px-1 py-1 font-medium">SL</th>
                  <th className="px-1 py-1 font-medium">PnL</th>
                  <th className="px-1 py-1 font-medium" />
                </tr>
              </thead>
              <tbody>
                {positions.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-zinc-800/60 hover:bg-zinc-800/30"
                  >
                    <td className="px-1 py-1 text-left">
                      <div className="font-mono text-[10px] font-semibold text-zinc-200">
                        {p.trading_symbol}
                      </div>
                      <div className="font-mono text-[9px] text-zinc-600">
                        {p.lots} lot{p.lots === 1 ? "" : "s"} ·{" "}
                        {p.protocol ? `Π ${p.protocol.slice(0, 1)}` : "—"}
                      </div>
                    </td>
                    <td className="px-1 py-1 font-mono text-[10px] text-zinc-400">
                      {p.quantity}
                    </td>
                    <td className="px-1 py-1 font-mono text-[10px] text-zinc-400">
                      {fmt(p.avg_price)}
                    </td>
                    <td className="px-1 py-1 font-mono text-[10px] text-zinc-200">
                      {fmt(p.ltp)}
                    </td>
                    <td className="px-1 py-1 font-mono text-[10px] text-rose-400/80">
                      {p.stop_loss !== null ? fmt(p.stop_loss) : "—"}
                    </td>
                    <td
                      className={cn(
                        "px-1 py-1 font-mono text-[10px] font-semibold",
                        pnlTone(p.unrealised_pnl),
                      )}
                    >
                      <div>{signedMoney(p.unrealised_pnl, 0)}</div>
                      <div className="text-[9px] opacity-75">
                        {p.pnl_pct > 0 ? "+" : ""}
                        {fmt(p.pnl_pct, 1)}%
                      </div>
                    </td>
                    <td className="px-1 py-1">
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          title="Scale out 50% (TP1)"
                          aria-label={`Scale out ${p.trading_symbol}`}
                          disabled={busy !== null || p.lots < 2}
                          onClick={() => run(`s-${p.id}`, () => api.scaleOut(p.id))}
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
                            run(`x-${p.id}`, () => api.exitPosition(p.id))
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {error ? (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[10px] text-rose-300">
            {error}
          </div>
        ) : null}

        {/* Panic flatten */}
        {confirmPanic ? (
          <div className="flex items-center gap-2 rounded border border-rose-500/50 bg-rose-500/10 p-2">
            <span className="flex-1 text-[10px] leading-snug text-rose-200">
              Flatten all {positions.length} position
              {positions.length === 1 ? "" : "s"} at market?
            </span>
            <Button
              variant="danger"
              size="sm"
              disabled={busy !== null}
              onClick={() =>
                run("panic", async () => {
                  await api.panicExit();
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
            disabled={positions.length === 0}
            onClick={() => setConfirmPanic(true)}
          >
            <AlertOctagon className="h-3.5 w-3.5" />
            Panic Flatten
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
