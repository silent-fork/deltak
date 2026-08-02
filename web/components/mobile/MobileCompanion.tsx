"use client";

import { LogOut, Radar, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

import { QuadrantPill } from "@/components/QuadrantPill";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Wordmark } from "@/components/Wordmark";
import { api, type MobileStateResponse } from "@/lib/api";
import type { Position } from "@/lib/types";
import { PROTOCOL_META, cn, fmt, pnlTone, signedMoney } from "@/lib/utils";

/** How often the phone re-polls its own read-only state. */
const POLL_MS = 5_000;

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.round(minutes / 60)}h ago`;
}

function SignalRow({ underlying, signal }: { underlying: string; signal: MobileStateResponse["signal"] }) {
  const s = signal?.signals[underlying];
  const meta = s ? PROTOCOL_META[s.protocol] : null;

  return (
    <div className="flex items-start justify-between gap-3 border-b border-zinc-800/60 px-3 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-mono text-[11px] font-semibold text-zinc-200">{underlying}</span>
          {meta ? (
            <Badge className={cn("h-4.5 px-1", meta.tone)}>{meta.name}</Badge>
          ) : null}
          <QuadrantPill quadrant={s?.quadrant} compact />
        </div>
        <p className="mt-1 truncate text-[11.5px] leading-snug text-zinc-400">
          {s?.headline ?? "Awaiting the live feed."}
        </p>
      </div>
      {s?.actionable ? (
        <span className="mt-0.5 flex shrink-0 items-center gap-1 rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-emerald-300">
          <Radar className="h-2.5 w-2.5 animate-pulse-ring" />
          Armed
        </span>
      ) : null}
    </div>
  );
}

function PositionRow({ position }: { position: Position }) {
  const pnl = position.status === "OPEN" ? position.unrealised_pnl : position.realised_pnl;
  const up = position.side === "BUY";
  return (
    <div className="flex items-center justify-between gap-2 border-b border-zinc-800/60 px-3 py-2 last:border-b-0">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {up ? (
            <TrendingUp className="h-3 w-3 shrink-0 text-emerald-400" />
          ) : (
            <TrendingDown className="h-3 w-3 shrink-0 text-rose-400" />
          )}
          <span className="truncate font-mono text-[11px] text-zinc-200">
            {position.trading_symbol}
          </span>
        </div>
        <p className="mt-0.5 text-[10px] text-zinc-500">
          {position.lots}×{position.lot_size} @ {fmt(position.avg_price)}
          {position.status === "CLOSED" && position.exit_price
            ? ` → ${fmt(position.exit_price)}`
            : ""}
        </p>
      </div>
      <span className={cn("shrink-0 font-mono text-[11.5px] font-semibold", pnlTone(pnl))}>
        {signedMoney(pnl)}
      </span>
    </div>
  );
}

export function MobileCompanion({ clientCode }: { clientCode: string }) {
  const [data, setData] = useState<MobileStateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await api.mobile.state();
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't reach the terminal.");
      }
    };
    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const unpair = async () => {
    setSigningOut(true);
    try {
      await api.mobile.logout();
    } finally {
      window.location.reload();
    }
  };

  const open = data?.positions.filter((p) => p.status === "OPEN") ?? [];
  const closed = data?.positions.filter((p) => p.status === "CLOSED").slice(0, 20) ?? [];
  const ledger = data?.signal?.ledger;

  return (
    <main className="dk-grid-bg min-h-dvh bg-zinc-950 pb-10">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-950/95 px-4 py-3 backdrop-blur">
        <div>
          <Wordmark className="text-[14px] tracking-[0.16em]" />
          <p className="mt-0.5 flex items-center gap-1 text-[9.5px] uppercase tracking-wider text-zinc-600">
            <ShieldCheck className="h-2.5 w-2.5" />
            {clientCode} · read-only
          </p>
        </div>
        <button
          onClick={() => void unpair()}
          disabled={signingOut}
          className="flex h-7 items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400 transition-colors hover:border-rose-500/50 hover:text-rose-300"
        >
          <LogOut className="h-3 w-3" />
          Unpair
        </button>
      </header>

      <div className="mx-auto max-w-md space-y-3 px-3 pt-3">
        {error ? (
          <div className="rounded border border-rose-500/40 bg-rose-500/10 p-2.5 text-[11px] text-rose-300">
            {error}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Live Signal</CardTitle>
            <span className="text-[9.5px] text-zinc-600">
              {data?.signal ? `desktop · ${timeAgo(data.signal_updated_at)}` : "waiting for desktop"}
            </span>
          </CardHeader>
          <CardContent className="p-0">
            {["NIFTY", "BANKNIFTY", "FINNIFTY"].map((u) => (
              <SignalRow key={u} underlying={u} signal={data?.signal ?? null} />
            ))}
          </CardContent>
        </Card>

        {ledger ? (
          <Card>
            <CardContent className="grid grid-cols-3 gap-2 p-3 text-center">
              <div>
                <p className="dk-label">Open</p>
                <p className={cn("mt-0.5 font-mono text-[13px] font-semibold", pnlTone(ledger.open_pnl))}>
                  {signedMoney(ledger.open_pnl)}
                </p>
              </div>
              <div>
                <p className="dk-label">Booked</p>
                <p className={cn("mt-0.5 font-mono text-[13px] font-semibold", pnlTone(ledger.realised_pnl))}>
                  {signedMoney(ledger.realised_pnl)}
                </p>
              </div>
              <div>
                <p className="dk-label">Total</p>
                <p className={cn("mt-0.5 font-mono text-[13px] font-semibold", pnlTone(ledger.total_pnl))}>
                  {signedMoney(ledger.total_pnl)}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Open Positions</CardTitle>
            <Badge className="h-4.5">{open.length}</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {open.length ? (
              open.map((p) => <PositionRow key={p.id} position={p} />)
            ) : (
              <p className="px-3 py-4 text-center text-[11px] text-zinc-600">Nothing open.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Closed Trades</CardTitle>
            <Badge className="h-4.5">{closed.length}</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {closed.length ? (
              closed.map((p) => <PositionRow key={p.id} position={p} />)
            ) : (
              <p className="px-3 py-4 text-center text-[11px] text-zinc-600">No trades yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
