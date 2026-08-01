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
import { useEffect, useState } from "react";

import { EventLogMenu } from "@/components/EventLogMenu";
import { LoginModal } from "@/components/LoginModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEngineContext } from "@/components/EngineProvider";
import { istParts } from "@/lib/engine/config";
import type {
  EngineSnapshot,
  ExecutionMode,
  RiskEvent,
  SpotQuote,
} from "@/lib/types";
import type { StreamState } from "@/lib/useEngine";
import { useCountdown, useTickFlash } from "@/lib/useEngine";
import { cn, countdown, fmt, signed } from "@/lib/utils";

/**
 * Exchange wall clock.
 *
 * Every protocol here is keyed to IST — the 3:15 PM Daylight Rest above all — so
 * the clock shows Mumbai's time wherever the browser happens to be, and says so.
 */
function useIstClock(): string {
  const [now, setNow] = useState(() => istParts());
  useEffect(() => {
    const id = setInterval(() => setNow(istParts()), 1000);
    return () => clearInterval(id);
  }, []);
  return [now.hour, now.minute, now.second]
    .map((v) => String(v).padStart(2, "0"))
    .join(":");
}

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
        "flex h-9 w-[148px] shrink-0 items-center gap-2 rounded-md border px-2 text-left transition-colors",
        active
          ? "border-quantum/60 bg-quantum/10"
          : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700",
      )}
    >
      <span
        className={cn(
          "h-6 w-[3px] shrink-0 rounded-full",
          up ? "bg-emerald-500" : "bg-rose-500",
          flash && "animate-pulse-ring",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="dk-label block truncate text-[9px] leading-none">
          {quote.label}
        </span>
        <span
          className={cn(
            "mt-1 block rounded font-mono text-[13px] font-semibold leading-none text-zinc-100",
            flash === "up" && "animate-tick-up",
            flash === "down" && "animate-tick-down",
          )}
        >
          {fmt(quote.ltp)}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 text-right font-mono text-[9px] leading-tight",
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
  events,
  onSelect,
  onRefreshStatus,
}: {
  snapshot: EngineSnapshot | null;
  streamState: StreamState;
  simulated: boolean;
  selected: string;
  events: RiskEvent[];
  onSelect: (underlying: string) => void;
  onRefreshStatus: () => void;
}) {
  const [loginOpen, setLoginOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [modeError, setModeError] = useState<string | null>(null);

  const engine = useEngineContext();
  const seconds = useCountdown(snapshot?.seconds_to_daylight_rest);
  const clock = useIstClock();
  const mode: ExecutionMode = snapshot?.mode ?? "paper";
  const authed = snapshot?.authenticated ?? false;

  async function toggleMode() {
    const next: ExecutionMode = mode === "paper" ? "live" : "paper";
    setSwitching(true);
    setModeError(null);
    try {
      engine.switchMode(next);
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
    // `backdrop-blur` gives the header its own stacking context, which later
    // siblings would otherwise paint over — pinning it above the board keeps the
    // logs dropdown in front of the hero cards.
    <header className="relative z-40 shrink-0 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
      {/*
        Three zones on one baseline: identity left, instruments centre, session
        state right. Below lg the instrument rail drops to its own full-width row
        instead of wrapping mid-cluster, so nothing ever sits half-aligned.
      */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-1.5">
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md border border-quantum/50 bg-quantum/10">
              <Zap className="h-4 w-4 text-quantum" />
            </div>
            <div className="leading-none">
              <div className="text-[13px] font-bold tracking-[0.16em] text-zinc-100">
                DELTA-K
              </div>
              <div className="mt-1 text-[8px] uppercase tracking-[0.22em] text-quantum/70">
                Terminal · DKMS
              </div>
            </div>
          </div>

          <EventLogMenu events={events} />
        </div>

        {/* Instruments — a scrolling rail, never a wrapping grid */}
        <div className="dk-scroll order-last flex w-full min-w-0 items-center gap-2 overflow-x-auto pb-0.5 lg:order-none lg:w-auto lg:flex-1">
          {Object.values(snapshot?.spots ?? {}).map((quote) => (
            <SpotTicker
              key={quote.underlying}
              quote={quote}
              active={quote.underlying === selected}
              onSelect={() => onSelect(quote.underlying)}
            />
          ))}
        </div>

        {/* Session state */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {simulated ? (
            <Badge className="h-7 border-amber-500/50 bg-amber-500/10 text-amber-300">
              <FlaskConical className="h-3 w-3" />
              Simulated
            </Badge>
          ) : null}

          <Badge
            className={cn(
              "h-7 border-zinc-800",
              snapshot?.market_open ? "text-emerald-300" : "text-zinc-500",
            )}
          >
            <Activity className="h-3 w-3" />
            {snapshot?.market_open ? "Open" : "Closed"}
          </Badge>

          <Badge className={cn("h-7 border-zinc-800", streamTone)}>
            <Radio
              className={cn("h-3 w-3", streamState === "live" && "animate-pulse-ring")}
            />
            {streamState === "live" ? "Live" : streamState}
          </Badge>

          {/* Exchange wall clock */}
          <span
            title="Exchange wall clock — Asia/Kolkata"
            className="flex h-7 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 font-mono text-[11px] font-semibold tabular-nums text-zinc-200"
          >
            {clock}
            <span className="text-[8px] font-normal uppercase tracking-wider text-zinc-600">
              IST
            </span>
          </span>

          {/* Daylight Rest countdown */}
          <Badge
            title="Time to the 3:15 PM IST Daylight Rest Protocol — all positions flatten automatically."
            className={cn(
              "h-7 border-zinc-800 font-semibold",
              seconds === 0
                ? "text-zinc-500"
                : seconds < 600
                  ? "border-rose-500/50 bg-rose-500/10 text-rose-300"
                  : "text-quantum",
            )}
          >
            <AlarmClock className="h-3 w-3" />
            {seconds === 0 ? "Rest" : countdown(seconds)}
          </Badge>

          <button
            onClick={toggleMode}
            disabled={switching}
            title={
              mode === "paper"
                ? "Paper mode — virtual ledger with simulated fills. Click to go live."
                : "LIVE mode — orders route to NSE. Click to return to paper."
            }
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md border px-2 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50",
              mode === "live"
                ? "border-rose-500/60 bg-rose-500/15 text-rose-300 hover:bg-rose-500/25"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800",
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

          {authed ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await engine.logout().catch(() => undefined);
                onRefreshStatus();
              }}
              className="h-7 border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            >
              <PlugZap className="h-3 w-3" />
              Connected
            </Button>
          ) : (
            <Button
              variant="quantum"
              size="sm"
              className="h-7"
              onClick={() => setLoginOpen(true)}
            >
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
