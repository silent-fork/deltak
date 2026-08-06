"use client";

import { CalendarDays } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { istMinutes } from "@/lib/engine/config";
import { fetchHolidays } from "@/lib/market/client";
import type { Holiday } from "@/lib/types";
import { cn } from "@/lib/utils";

/** 9:00 AM to 3:45 PM IST — a quarter past the bell close, not the bell itself. */
const POLL_START_MIN = 9 * 60;
const POLL_END_MIN = 15 * 60 + 45;
const POLL_INTERVAL_MS = 15 * 60_000;

/** "in 3 days", "tomorrow", "today" — a countdown reads faster than a date. */
function relativeDay(daysAway: number): string {
  if (daysAway <= 0) return "today";
  if (daysAway === 1) return "tomorrow";
  return `in ${daysAway}d`;
}

function daysAway(isoDate: string): number {
  const target = Date.parse(`${isoDate}T00:00:00+05:30`);
  const now = Date.now();
  return Math.round((target - now) / 86_400_000);
}

export function HolidayMenu() {
  const [open, setOpen] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  /**
   * Fetched once on page load regardless of the hour — an operator opening
   * the tab at 11 PM still wants to see the calendar — then re-polled every
   * 15 minutes, but only while that poll actually falls inside the trading
   * window. Left running past midnight, this stops re-hitting NSE's site
   * for a calendar that is not going to change between 4 PM and 9 AM.
   */
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetchHolidays();
        if (!cancelled) {
          setHolidays(res.holidays);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Holiday calendar unavailable.");
        }
      }
    };

    void load();
    const id = setInterval(() => {
      const m = istMinutes();
      if (m >= POLL_START_MIN && m <= POLL_END_MIN) void load();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const next = holidays[0];
  const nextDays = next ? daysAway(next.date) : null;

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="NSE's F&O trading-holiday calendar"
        className={cn(
          "flex h-7 items-center gap-1.5 rounded-md border px-2 font-mono text-[10px] uppercase tracking-wider transition-colors",
          open
            ? "border-quantum/60 bg-quantum/10 text-quantum"
            : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
        )}
      >
        <CalendarDays className="h-3 w-3" />
        {next ? (
          <span className="flex items-center gap-1.5">
            {/* Near-term amber, further out a quiet dot — the same urgency
                language the badge in the dropdown uses, just compressed to
                one glyph for the collapsed state. */}
            <span
              aria-hidden
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                (nextDays ?? 0) <= 3 ? "bg-amber-400" : "bg-zinc-600",
              )}
            />
            <span className="normal-case tracking-normal text-zinc-400">
              {relativeDay(nextDays ?? 0)}
            </span>
          </span>
        ) : (
          "Holidays"
        )}
      </button>

      {open ? (
        <div
          role="menu"
          className="dk-scroll absolute right-0 top-full z-50 mt-1 max-h-[60vh] w-[min(22rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-zinc-700 bg-[#0b0b0e] shadow-2xl shadow-black ring-1 ring-black/60"
        >
          <div className="sticky top-0 flex items-center justify-between border-b border-zinc-800 bg-[#0b0b0e] px-3 py-2">
            <span className="dk-label text-[10px] leading-none">
              NSE F&amp;O Holidays
            </span>
            <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
              nse-bse-api
            </span>
          </div>

          {error ? (
            <div className="px-3 py-6 text-center text-[11px] text-amber-400/80">
              {error}
            </div>
          ) : holidays.length === 0 ? (
            <div className="px-3 py-6 text-center text-[11px] text-zinc-600">
              Loading the calendar…
            </div>
          ) : (
            <ul className="p-1.5">
              {holidays.map((h) => {
                const away = daysAway(h.date);
                // A holiday that lands on a weekend is not a day the market
                // was actually going to trade anyway — worth marking, not
                // worth the same weight as one that bites into a weekday.
                const onWeekend = h.weekday === "Saturday" || h.weekday === "Sunday";
                const date = new Date(`${h.date}T00:00:00+05:30`);
                const dayNum = date.toLocaleDateString("en-IN", { day: "2-digit" });
                const monthAbbrev = date
                  .toLocaleDateString("en-IN", { month: "short" })
                  .toUpperCase();

                return (
                  <li
                    key={h.date}
                    className={cn(
                      "flex items-center gap-2.5 rounded px-1.5 py-1.5 text-[11px] leading-snug hover:bg-zinc-900/70",
                      onWeekend && "opacity-50",
                    )}
                  >
                    {/* A dated block, not an icon — the calendar the rest of the
                        terminal already speaks (see the ticker's own numeric
                        badges) rather than a festival glyph. */}
                    <span className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded-md border border-zinc-800 bg-zinc-950/60">
                      <span className="font-mono text-[13px] font-bold leading-none text-zinc-200">
                        {dayNum}
                      </span>
                      <span className="mt-1 text-[8px] font-medium uppercase tracking-wider text-zinc-600">
                        {monthAbbrev}
                      </span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-zinc-200">
                        {h.description}
                      </span>
                      <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                        {h.weekday}
                        {onWeekend ? (
                          <span className="rounded border border-zinc-800 px-1 text-zinc-500">
                            weekend
                          </span>
                        ) : null}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider",
                        away <= 3
                          ? "bg-quantum/15 text-quantum"
                          : "bg-zinc-800 text-zinc-500",
                      )}
                    >
                      {relativeDay(away)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
