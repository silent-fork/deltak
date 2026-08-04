"use client";

import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CalendarEvent, CalendarEventType } from "@/lib/tools/corporateCalendarTypes";

const TYPE_META: Record<CalendarEventType, { label: string; border: string; dot: string }> = {
  RESULTS: { label: "Results", border: "border-l-quantum", dot: "bg-quantum" },
  ACTION: { label: "Action", border: "border-l-aegis", dot: "bg-aegis" },
  IPO: { label: "IPO", border: "border-l-violet-400", dot: "bg-violet-400" },
};

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function nextSevenDays(): { iso: string; dow: string; dd: number; today: boolean }[] {
  const out = [];
  const now = new Date();
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    out.push({
      iso: d.toISOString().slice(0, 10),
      dow: DOW[d.getDay()]!,
      dd: d.getDate(),
      today: i === 0,
    });
  }
  return out;
}

function EventChip({ e }: { e: CalendarEvent }) {
  const meta = TYPE_META[e.type];
  return (
    <div className={cn("rounded border-l-2 bg-white/[0.03] px-2 py-1.5", meta.border)}>
      <div className="flex items-center gap-1.5 font-mono text-[11px] font-semibold text-zinc-200">
        {e.fno ? (
          <span className="h-1 w-1 shrink-0 rounded-full bg-quantum shadow-[0_0_5px_#00f0ff]" />
        ) : null}
        <span className="truncate">{e.symbol}</span>
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-zinc-500">{e.description}</div>
    </div>
  );
}

/**
 * Results (from board meetings), corporate actions and IPO milestones —
 * F&O names flagged. Days with nothing on them are dropped outright rather
 * than shown as an empty "—" tab: nothing to switch to.
 *
 * One day's events at a time, chosen from a tab strip, rather than a
 * multi-column week grid or a single scroll-through-everything list — the
 * two shapes tried before this either truncated every entry to a handful of
 * characters (the old mobile stack squeezed onto a grid) or forced scrolling
 * past a dense day's 15+ rows to reach the next one (the old vertical
 * stack). A tab strip scales the same way on a phone and a monitor: pick a
 * day, read its list in full, and the panel's own height stays bounded by
 * one day's worth of events instead of the whole week's, which is also what
 * kept it from outgrowing its card when a heavy week collided with the
 * page's fixed-viewport desktop shell.
 */
export function EventTimeline({ events }: { events: CalendarEvent[] }) {
  const days = nextSevenDays()
    .map((day) => ({
      ...day,
      events: (events.filter((e) => e.date === day.iso) ?? []).sort((a, b) =>
        a.fno === b.fno ? 0 : a.fno ? -1 : 1,
      ),
    }))
    .filter((day) => day.events.length > 0);

  const [selectedIso, setSelectedIso] = useState<string | null>(null);
  const selectedDay = days.find((d) => d.iso === selectedIso) ?? days[0] ?? null;

  const legend = (
    <div className="flex gap-3 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
      {(Object.keys(TYPE_META) as CalendarEventType[]).map((t) => (
        <span key={t} className="flex items-center gap-1">
          <span className={cn("h-1.5 w-1.5 rounded-full", TYPE_META[t].dot)} />
          {TYPE_META[t].label}
        </span>
      ))}
    </div>
  );

  if (!selectedDay) {
    return (
      <Card className="min-h-0 shrink-0">
        <CardHeader>
          <CardTitle>This Week</CardTitle>
          {legend}
        </CardHeader>
        <CardContent className="flex min-h-[100px] items-center justify-center">
          <p className="font-mono text-[10px] text-zinc-600">Nothing scheduled in the next 7 days.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="min-h-0 shrink-0">
      <CardHeader>
        <CardTitle>This Week</CardTitle>
        {legend}
      </CardHeader>
      <CardContent className="p-2">
        {/* Compact scrollable pills below `lg` — a phone has no room to spare.
            At `lg` and up, `flex-1` on every tab spreads them across the
            full card width instead of leaving it mostly empty, and each one
            earns the extra room with a symbol preview and a per-type count
            a thumbnail of the day rather than just its date. */}
        <div className="dk-scroll flex gap-1.5 overflow-x-auto pb-1 lg:gap-2 lg:overflow-visible">
          {days.map((day) => {
            const active = day.iso === selectedDay.iso;
            const types = [...new Set(day.events.map((e) => e.type))];
            const preview = day.events
              .slice(0, 2)
              .map((e) => e.symbol)
              .join(", ");
            const more = day.events.length > 2 ? ` +${day.events.length - 2} more` : "";
            return (
              <button
                key={day.iso}
                onClick={() => setSelectedIso(day.iso)}
                className={cn(
                  "flex shrink-0 flex-col items-center gap-1 rounded-lg border px-3 py-2 transition-colors",
                  "lg:w-0 lg:flex-1 lg:flex-row lg:items-center lg:justify-between lg:gap-3 lg:px-4 lg:py-3",
                  active
                    ? "border-quantum/60 bg-quantum/10"
                    : day.today
                      ? "border-quantum/25 bg-quantum/[0.03] hover:border-quantum/40"
                      : "border-zinc-800/70 bg-white/[0.012] hover:border-zinc-700",
                )}
              >
                <span className="flex items-center gap-2 lg:shrink-0">
                  <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600 lg:text-[10px]">
                    {day.dow}
                  </span>
                  <span
                    className={cn(
                      "text-sm font-bold lg:text-base",
                      active ? "text-quantum" : "text-zinc-200",
                    )}
                  >
                    {day.dd}
                  </span>
                </span>
                <span className="hidden min-w-0 flex-1 truncate text-left font-mono text-[10px] text-zinc-500 lg:block">
                  {preview}
                  <span className="text-zinc-700">{more}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="flex items-center gap-0.5">
                    {types.map((t) => (
                      <span key={t} className={cn("h-1 w-1 rounded-full", TYPE_META[t].dot)} />
                    ))}
                  </span>
                  <span className="hidden font-mono text-[9px] text-zinc-600 lg:inline">
                    {day.events.length}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* A single full-width column read as a stack of mostly-empty bars
            once the panel stopped being squeezed into a narrow week grid —
            each chip is two short lines, and a wide card gave it nowhere to
            put the rest of the row. Packing several per row uses that width
            instead of wasting it. */}
        <div className="dk-scroll mt-2 grid max-h-[340px] grid-cols-1 gap-1.5 overflow-y-auto p-0.5 sm:grid-cols-2 xl:grid-cols-3">
          {selectedDay.events.map((e, i) => (
            <EventChip key={`${e.symbol}-${e.type}-${i}`} e={e} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
