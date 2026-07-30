"use client";

import {
  Activity,
  AlarmClock,
  FlaskConical,
  Plug,
  PlugZap,
  Radio,
  Zap,
} from "lucide-react";
import { useState } from "react";

import { LoginModal } from "@/components/LoginModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { EngineSnapshot, ExecutionMode, SpotQuote } from "@/lib/types";
import type { StreamState } from "@/lib/useEngine";
import { useCountdown, useTickFlash } from "@/lib/useEngine";
import { cn, countdown, fmt, signed } from "@/lib/utils";

function SpotTicker({
  quote,
  active,
  onSelect,
}: {
  quote: SpotQuote;
  active: boolean;
  onSelect: () => void;
}) {
  const flash = useTickFlash(quote.ltp);
  const up = quote.change >= 0;

  return (
    <button
      onClick={onSelect}
      className={cn(
        "group flex min-w-[150px] items-center gap-2.5 rounded-md border px-2.5 py-1.5 text-left transition-colors",
        active
          ? "border-quantum/60 bg-quantum/10"
          : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700",
      )}
    >
      <span
        className={cn(
          "h-6 w-[3px] rounded-full",
          up ? "bg-emerald-500" : "bg-rose-500",
          flash && "animate-pulse-ring",
        )}
      />
      <span className="flex-1">
        <span className="dk-label block leading-none">{quote.label}</span>
        <span
          className={cn(
            "mt-1 block rounded px-0.5 font-mono text-sm font-semibold leading-none text-zinc-100",
            flash === "up" && "animate-tick-up",
            flash === "down" && "animate-tick-down",
          )}
        >
          {fmt(quote.ltp)}
        </span>
      </span>
      <span
        className={cn(
          "text-right font-mono text-[10px] leading-tight",
          up ? "text-emerald-400" : "text-rose-400",
        )}
      >
        <span className="block">{signed(quote.change)}</span>
        <span className="block opacity-80">{signed(quote.change_pct)}%</span>
      </span>
    </button>
  );
}

export function Header({
  snapshot,
  streamState,
  simulated,
  selected,
  onSelect,
  onRefreshStatus,
}: {
  snapshot: EngineSnapshot | null;
  streamState: StreamState;
  simulated: boolean;
  selected: string;
  onSelect: (underlying: string) => void;
  onRefreshStatus: () => void;
}) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);

  const seconds = useCountdown(snapshot?.seconds_to_daylight_rest);
  const mode: ExecutionMode = snapshot?.mode ?? "paper";
  const authed = snapshot?.authenticated ?? false;

  async function toggleMode() {
    const next: ExecutionMode = mode === "paper" ? "live" : "paper";
    setSwitching(true);
    setModeError(null);
    try {
      await api.setMode(next);
      onRefreshStatus();
    } catch (err) {
      setModeError(err instanceof Error ? err.message : "Mode switch rejected");
      setTimeout(() => setModeError(null), 6000);
    } finally {
      setSwitching(false);
    }
  }

  const streamTone =
    streamState === "live"
      ? "text-emerald-400"
      : streamState === "error"
        ? "text-rose-400"
        : "text-amber-400";

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2">
        {/* Brand */}
        <div className="flex items-center gap-2 pr-1">
          <div className="flex h-7 w-7 items-center justify-center rounded border border-quantum/50 bg-quantum/10">
            <Zap className="h-3.5 w-3.5 text-quantum" />
          </div>
          <div className="leading-none">
            <div className="text-sm font-bold tracking-[0.16em] text-zinc-100">
              DELTA-K
            </div>
            <div className="mt-0.5 text-[9px] uppercase tracking-[0.22em] text-quantum/70">
              Terminal · DKMS
            </div>
          </div>
        </div>

        {/* Spot-option anchor */}
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {Object.values(snapshot?.spots ?? {}).map((quote) => (
            <SpotTicker
              key={quote.underlying}
              quote={quote}
              active={quote.underlying === selected}
              onSelect={() => onSelect(quote.underlying)}
            />
          ))}
        </div>

        {/* Status cluster */}
        <div className="flex flex-wrap items-center gap-2">
          {simulated ? (
            <Badge className="border-amber-500/50 bg-amber-500/10 text-amber-300">
              <FlaskConical className="h-3 w-3" />
              Simulated Feed
            </Badge>
          ) : null}

          <Badge
            className={cn(
              "border-zinc-700",
              snapshot?.market_open
                ? "text-emerald-300"
                : "text-zinc-500",
            )}
          >
            <Activity className="h-3 w-3" />
            {snapshot?.market_open ? "Market Open" : "Market Closed"}
          </Badge>

          <Badge className={cn("border-zinc-700", streamTone)}>
            <Radio className={cn("h-3 w-3", streamState === "live" && "animate-pulse-ring")} />
            {streamState === "live" ? "Stream Live" : streamState}
          </Badge>

          {/* Daylight Rest countdown */}
          <Badge
            title="3:15 PM IST Daylight Rest Protocol — all positions flatten automatically."
            className={cn(
              "border-zinc-700 font-semibold",
              seconds === 0
                ? "text-zinc-500"
                : seconds < 600
                  ? "border-rose-500/50 bg-rose-500/10 text-rose-300"
                  : "text-quantum",
            )}
          >
            <AlarmClock className="h-3 w-3" />
            {seconds === 0 ? "Rest Elapsed" : countdown(seconds)}
          </Badge>

          {/* Execution mode */}
          <button
            onClick={toggleMode}
            disabled={switching}
            title={
              mode === "paper"
                ? "Paper mode — virtual ledger with simulated fills. Click to go live."
                : "LIVE mode — orders route to NSE. Click to return to paper."
            }
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50",
              mode === "live"
                ? "border-rose-500/60 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700",
            )}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                mode === "live" ? "bg-rose-400 animate-pulse-ring" : "bg-zinc-500",
              )}
            />
            {mode === "live" ? "Live" : "Paper"}
          </button>

          {/* Auth */}
          {authed ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await api.logout().catch(() => undefined);
                onRefreshStatus();
              }}
              className="border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            >
              <PlugZap className="h-3 w-3" />
              Connected
            </Button>
          ) : (
            <Button variant="quantum" size="sm" onClick={() => setLoginOpen(true)}>
              <Plug className="h-3 w-3" />
              Connect
            </Button>
          )}
        </div>
      </div>

      {modeError ? (
        <div className="border-t border-rose-500/30 bg-rose-500/10 px-3 py-1 text-[11px] text-rose-300">
          {modeError}
        </div>
      ) : null}

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={onRefreshStatus}
      />
    </header>
  );
}
