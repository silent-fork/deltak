"use client";

import { CalendarDays, PartyPopper } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { istMinutes } from "@/lib/engine/config";
import { fetchHolidays } from "@/lib/market/client";
import type { Holiday } from "@/lib/types";
import { cn } from "@/lib/utils";

/** 9:00 AM to 3:45 PM IST — a quarter past the bell close, not the bell itself. */
const POLL_START_MIN = 9 * 60;
const POLL_END_MIN = 15 * 60 + 45;
const POLL_INTERVAL_MS = 15 * 60_000;

/** One glance at the kind of day it is, ahead of reading the name. */
function festivalIcon(description: string): string {
  const d = description.toLowerCase();
  if (d.includes("diwali") || d.includes("deepavali")) return "🪔";
  if (d.includes("holi")) return "🎨";
  if (d.includes("eid") || d.includes("id-ul") || d.includes("bakri")) return "🌙";
  if (d.includes("muharram")) return "🕌";
  if (d.includes("christmas")) return "🎄";
  if (d.includes("independence")) return "🇮🇳";
  if (d.includes("republic day")) return "🇮🇳";
  if (d.includes("gandhi") || d.includes("ambedkar") || d.includes("guru nanak") || d.includes("gurpurb"))
    return "🕊️";
  if (d.includes("ganesh")) return "🐘";
  if (d.includes("dussehra") || d.includes("dasara") || d.includes("vijaya")) return "🏹";
  if (d.includes("ram navami") || d.includes("mahavir") || d.includes("shivratri") || d.includes("navratri"))
    return "🙏";
  if (d.includes("good friday")) return "✝️";
  if (d.includes("election")) return "🗳️";
  return "📅";
}

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
          <span className="flex items-center gap-1">
            <span aria-hidden>{festivalIcon(next.description)}</span>
            <span className="normal-case tracking-normal text-zinc-500">
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
            <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
              <PartyPopper className="h-3 w-3 text-quantum" />
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
                const label = date.toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                });

                return (
                  <li
                    key={h.date}
                    className={cn(
                      "flex items-center gap-2 rounded px-1.5 py-1.5 text-[11px] leading-snug hover:bg-zinc-900/70",
                      onWeekend && "opacity-50",
                    )}
                  >
                    <span aria-hidden className="text-base leading-none">
                      {festivalIcon(h.description)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-zinc-200">
                        {h.description}
                      </span>
                      <span className="block font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                        {label} · {h.weekday}
                        {onWeekend ? " · weekend" : ""}
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
