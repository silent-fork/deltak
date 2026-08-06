"use client";

import {
  Activity,
  FlaskConical,
  Hand,
  Plug,
  Radar,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { EventLogMenu } from "@/components/EventLogMenu";
import { HolidayMenu } from "@/components/HolidayMenu";
import { LoginModal } from "@/components/LoginModal";
import { UserPill } from "@/components/UserPill";
import { Wordmark } from "@/components/Wordmark";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useEngineContext } from "@/components/EngineProvider";
import { INDEX_UNIVERSE, istParts } from "@/lib/engine/config";
import type {
  EngineSnapshot,
  ExecutionMode,
  RiskEvent,
  SpotQuote,
} from "@/lib/types";
import { useTickFlash } from "@/lib/useEngine";
import { cn, fmt, signed, signedMoney } from "@/lib/utils";

/** Sensex ahead of Bankex in the header rail — the more heavily-traded of BSE's two. */
const BSE_TICKER_ORDER: Record<string, number> = { SENSEX: 0, BANKEX: 1 };

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

/** Open-position rollup for one underlying — what the header rail's own live-trade badge is built from. */
type ActiveTrade = { count: number; pnl: number };

function SpotTicker({
  quote,
  active,
  activeTrade,
  onSelect,
}: {
  quote: SpotQuote;
  active: boolean;
  /** Non-null while this index has at least one open position — drives the corner badge. */
  activeTrade: ActiveTrade | null;
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
        // The home page's own card treatment (`dk-panel`): a soft glass
        // surface with its own blur and shadow, rather than a flat filled
        // rectangle — the active tab additionally picks up a quiet quantum
        // glow, echoing the hero's own accent-lit cards instead of a plain
        // colour swap.
        "dk-panel relative flex h-9 w-[162px] shrink-0 items-center gap-2 border px-2 text-left transition-all duration-150",
        active
          ? "border-quantum/60 bg-quantum/10 shadow-[0_0_18px_-6px_rgba(0,240,255,0.45)]"
          : activeTrade
            ? "border-amber-500/40 bg-zinc-900/40 hover:border-amber-500/60 hover:bg-zinc-900/70"
            : "border-zinc-800/70 bg-zinc-900/40 hover:border-zinc-700 hover:bg-zinc-900/70",
      )}
    >
      {/*
        A trade sitting on this index, at a glance, without opening the book —
        a radar-style ping in the same emerald/rose the P&L itself uses, so
        "there's a live position here" and "it's up or down right now" read
        off one glyph instead of two. A plain dot rather than a numbered
        badge: the count/P&L still ride the tooltip, but a wider glyph here
        sat over the ticker's own change/% text at this card's width.

        Inset (bottom-0.5/right-0.5), not overflowing past the button's own
        edge — the ticker rail is `overflow-x-auto`, and a browser forces
        overflow-y to `auto` too the moment one axis isn't `visible`, so even
        a couple of overflowing pixels here was enough to put a scrollbar (and
        extra height) on the whole row.
      */}
      {activeTrade ? (
        <span
          title={`${activeTrade.count} open position${activeTrade.count === 1 ? "" : "s"} on ${quote.label} · ${signedMoney(activeTrade.pnl, 0)} unrealised`}
          className="absolute bottom-0.5 right-0.5 flex h-2.5 w-2.5"
        >
          <span
            className={cn(
              "absolute inset-0 animate-ping rounded-full opacity-75",
              activeTrade.pnl >= 0 ? "bg-emerald-500" : "bg-rose-500",
            )}
          />
          <span
            className={cn(
              "relative h-2.5 w-2.5 rounded-full border",
              activeTrade.pnl >= 0
                ? "border-emerald-300 bg-emerald-500"
                : "border-rose-300 bg-rose-500",
            )}
          />
        </span>
      ) : null}
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
            // The flash used to be a letter-tight rectangle with a 4px
            // radius, reading as a hard highlighter block rather than a
            // tick. Negative margins give the fill room to breathe past the
            // glyphs without shifting the ticker's own layout, and a wider
            // radius keeps it soft at this size.
            "-mx-1 -my-0.5 mt-0.5 block rounded-md px-1 py-0.5 font-mono text-[13px] font-semibold leading-none",
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
  simulated,
  selected,
  events,
  onSelect,
  onRefreshStatus,
}: {
  snapshot: EngineSnapshot | null;
  simulated: boolean;
  selected: string;
  events: RiskEvent[];
  onSelect: (underlying: string) => void;
  onRefreshStatus: () => void;
}) {
  const [loginOpen, setLoginOpen] = useState(false);

  /**
   * NSE's own three first, then BSE's two — grouped by exchange rather than
   * INDEX_UNIVERSE's declaration order, with a thin divider between the two
   * clusters so the rail reads as "one exchange, then the other" rather than
   * five same-looking tiles in a row. Sensex ahead of Bankex within the BSE
   * cluster specifically, since that's the more heavily-traded of the two.
   */
  const { nseSpots, bseSpots } = useMemo(() => {
    const all = Object.values(snapshot?.spots ?? {});
    const nse = all.filter((q) => INDEX_UNIVERSE[q.underlying]?.exchange !== "BSE");
    const bse = all
      .filter((q) => INDEX_UNIVERSE[q.underlying]?.exchange === "BSE")
      .sort((a, b) => (BSE_TICKER_ORDER[a.underlying] ?? 99) - (BSE_TICKER_ORDER[b.underlying] ?? 99));
    return { nseSpots: nse, bseSpots: bse };
  }, [snapshot?.spots]);

  /**
   * Every open position, rolled up by its underlying — the header rail's own
   * feed for "is a trade live here," independent of whether the Trade Book
   * happens to be the visible tab. Summing `unrealised_pnl` alongside the
   * count lets the badge itself carry the same up/down colour language as
   * the rest of the terminal, rather than a single neutral "something's
   * open" tone.
   */
  const activeByUnderlying = useMemo(() => {
    const map: Record<string, { count: number; pnl: number }> = {};
    for (const p of snapshot?.ledger?.open_positions ?? []) {
      const entry = map[p.underlying] ?? { count: 0, pnl: 0 };
      entry.count += 1;
      entry.pnl += p.unrealised_pnl;
      map[p.underlying] = entry;
    }
    return map;
  }, [snapshot?.ledger?.open_positions]);

  const engine = useEngineContext();
  const clock = useIstClock();
  const marketOpen = snapshot?.market_open ?? false;
  const mode: ExecutionMode = snapshot?.mode ?? "paper";
  const authed = snapshot?.authenticated ?? false;
  const automation = engine.automation;

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
            <div
              className="flex h-8 w-8 items-center justify-center rounded-md border border-quantum/40 bg-quantum/10"
              style={{ boxShadow: "0 0 0 1px rgba(0,240,255,0.16), 0 0 12px rgba(0,240,255,0.06)" }}
            >
              <Zap className="h-4 w-4 text-quantum/80" />
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
          {nseSpots.map((quote) => (
            <SpotTicker
              key={quote.underlying}
              quote={quote}
              active={quote.underlying === selected}
              activeTrade={activeByUnderlying[quote.underlying] ?? null}
              onSelect={() => onSelect(quote.underlying)}
            />
          ))}
          {nseSpots.length > 0 && bseSpots.length > 0 ? (
            <span
              aria-hidden
              className="h-6 w-px shrink-0 self-center bg-zinc-700"
            />
          ) : null}
          {bseSpots.map((quote) => (
            <SpotTicker
              key={quote.underlying}
              quote={quote}
              active={quote.underlying === selected}
              activeTrade={activeByUnderlying[quote.underlying] ?? null}
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

          <HolidayMenu />

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
              className="h-7 border-quantum/35 bg-quantum/[0.08] text-quantum/80 hover:bg-quantum/15"
              style={{ boxShadow: "0 0 0 1px rgba(0,240,255,0.16), 0 0 10px rgba(0,240,255,0.06)" }}
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
    </header>
  );
}
