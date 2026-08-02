"use client";

import {
  Activity,
  AlarmClock,
  FlaskConical,
  Hand,
  Plug,
  QrCode,
  Radar,
  Radio,
  Sunrise,
  Zap,
} from "lucide-react";
import { useEffect, useState } from "react";

import { EventLogMenu } from "@/components/EventLogMenu";
import { LoginModal } from "@/components/LoginModal";
import { PairMobileModal } from "@/components/PairMobileModal";
import { UserPill } from "@/components/UserPill";
import { Wordmark } from "@/components/Wordmark";
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
  // Every underlying gets an entry in `spots` the moment a session exists,
  // whether or not its own spot token has printed yet — an unfocused index
  // can sit here for a beat with nothing but the zero the store falls back
  // to. Showing that as ₹0.00 in emerald or rose reads as "this crashed to
  // zero," which is a different and false claim from "not quoted yet."
  const quoted = quote.ltp > 0;

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
          quoted ? (up ? "bg-emerald-500" : "bg-rose-500") : "bg-zinc-700",
          flash && "animate-pulse-ring",
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="dk-label block truncate text-[9px] leading-none">
          {quote.label}
        </span>
        <span
          className={cn(
            "mt-1 block rounded font-mono text-[13px] font-semibold leading-none",
            quoted ? "text-zinc-100" : "text-zinc-600",
            flash === "up" && "animate-tick-up",
            flash === "down" && "animate-tick-down",
          )}
        >
          {quoted ? fmt(quote.ltp) : "Quoting…"}
        </span>
      </span>
      {quoted ? (
        <span
          className={cn(
            "shrink-0 text-right font-mono text-[9px] leading-tight",
            up ? "text-emerald-400" : "text-rose-400",
          )}
        >
          <span className="block">{signed(quote.change)}</span>
          <span className="block opacity-80">{signed(quote.change_pct)}%</span>
        </span>
      ) : (
        <span className="shrink-0 font-mono text-[9px] text-zinc-700">—</span>
      )}
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
  const [pairOpen, setPairOpen] = useState(false);

  const engine = useEngineContext();
  const seconds = useCountdown(snapshot?.seconds_to_daylight_rest);
  const toOpen = useCountdown(snapshot?.seconds_to_open);
  const clock = useIstClock();
  const marketOpen = snapshot?.market_open ?? false;
  const mode: ExecutionMode = snapshot?.mode ?? "paper";
  const authed = snapshot?.authenticated ?? false;
  const automation = engine.automation;

  /*
   * "Closed" and "Live" side by side was a contradiction the operator had to
   * resolve themselves. SmartStream accepts a subscription at any hour and then
   * sends nothing, so a connected socket says only that the wire is up — while
   * the exchange is shut it reads as Linked, and the board it feeds is settled
   * on the last session rather than running.
   */
  const trading = marketOpen || simulated;
  const linked = streamState === "live" && !trading;
  const streamLabel =
    streamState === "live" ? (trading ? "Live" : "Linked") : streamState;
  const streamTone =
    streamState === "error"
      ? "text-rose-400"
      : streamState === "live"
        ? trading
          ? "text-emerald-400"
          : "text-zinc-500"
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
              <Wordmark className="text-[13px] tracking-[0.16em]" />
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
              marketOpen ? "text-emerald-300" : "text-zinc-500",
            )}
          >
            <Activity className="h-3 w-3" />
            {marketOpen ? "Open" : "Closed"}
          </Badge>

          <Badge
            title={
              linked
                ? "Socket connected, exchange closed — no prints are arriving. The board is settled on the last session."
                : "Market-data socket status."
            }
            className={cn("h-7 border-zinc-800", streamTone)}
          >
            <Radio
              className={cn(
                "h-3 w-3",
                streamState === "live" && trading && "animate-pulse-ring",
              )}
            />
            {streamLabel}
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

          {/*
            One slot, two clocks. In session it counts down to the 3:15 PM
            flatten; out of hours that number means nothing — a Saturday
            afternoon has no Daylight Rest — so it counts to the next bell
            instead. Exchange holidays are not known to the terminal, so the
            open it names is the next weekday's, holiday or not.
          */}
          {marketOpen ? (
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
          ) : (
            <Badge
              title="Time to the next 9:15 AM IST open, skipping the weekend. Exchange holidays are not accounted for."
              className="h-7 border-zinc-800 font-semibold text-zinc-400"
            >
              <Sunrise className="h-3 w-3" />
              <span className="text-[9px] font-normal uppercase tracking-wider text-zinc-600">
                Opens
              </span>
              {toOpen > 0 ? countdown(toOpen) : "—"}
            </Badge>
          )}

          {/*
            Paper vs Live used to live here; Live has no server-side home yet
            (see the Watchdog section of the README), so surfacing a toggle
            for a mode that isn't really available was its own kind of
            misleading. This slot is Autopilot vs Manual instead — who fires
            an actionable signal, the one choice that's actually live today.
            Purely local UI state: unlike a broker mode switch, this never
            touches Angel One and can never be rejected.
          */}
          <button
            onClick={() => engine.setAutomation(automation === "auto" ? "manual" : "auto")}
            title={
              automation === "auto"
                ? "Autopilot — actionable signals execute themselves as paper trades. Click for Manual."
                : "Manual — you execute every signal by hand from the Signal Deck. Click for Autopilot."
            }
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md border px-2 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors",
              automation === "auto"
                ? "border-quantum/60 bg-quantum/15 text-quantum hover:bg-quantum/25"
                : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:bg-zinc-800",
            )}
          >
            {automation === "auto" ? (
              <Radar className="h-3 w-3 animate-pulse-ring" />
            ) : (
              <Hand className="h-3 w-3" />
            )}
            {automation === "auto" ? "Autopilot" : "Manual"}
          </button>

          {/*
            Read-only phone companion — only meaningful once a trading
            session actually exists to mirror. Angel One's own sign-in never
            renders on the phone; this is the one thing a phone needs from
            the desktop to see anything at all.
          */}
          {authed ? (
            <button
              onClick={() => setPairOpen(true)}
              title="Pair a phone to watch signals and trades, read-only — no Angel One sign-in on the phone."
              className="flex h-7 items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900/60 px-2 font-mono text-[10px] font-bold uppercase tracking-wider text-zinc-300 transition-colors hover:border-quantum/50 hover:text-quantum"
            >
              <QrCode className="h-3 w-3" />
              Pair Mobile
            </button>
          ) : null}

          {/*
            The account, not just the connection. "Connected" proved a session
            existed and said nothing about whose — with a client code, a name
            and the day's book behind it, this answers both.
          */}
          {authed ? (
            <UserPill
              profile={engine.session.profile}
              clientCode={engine.session.clientCode ?? ""}
              loginTime={engine.session.loginTime}
              mode={mode}
              ledger={snapshot?.ledger}
              onSignedOut={onRefreshStatus}
            />
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

      <LoginModal
        open={loginOpen}
        onClose={() => setLoginOpen(false)}
        onSuccess={onRefreshStatus}
      />
      <PairMobileModal open={pairOpen} onClose={() => setPairOpen(false)} />
    </header>
  );
}
