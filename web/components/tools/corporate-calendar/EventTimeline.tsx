"use client";

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
    <div className={cn("rounded border-l-2 bg-white/[0.03] px-1.5 py-1", meta.border)}>
      <div className="flex items-center gap-1 font-mono text-[10px] font-semibold text-zinc-200">
        {e.fno ? (
          <span className="h-1 w-1 shrink-0 rounded-full bg-quantum shadow-[0_0_5px_#00f0ff]" />
        ) : null}
        <span className="truncate">{e.symbol}</span>
      </div>
      <div className="text-[9px] leading-snug text-zinc-500 lg:truncate">{e.description}</div>
    </div>
  );
}

/**
 * Results (from board meetings), corporate actions and IPO milestones —
 * F&O names flagged. Days with nothing on them are dropped outright rather
 * than shown as an empty "—" column: a bare cell just wastes the width a
 * real day could use.
 *
 * Two different shapes, not one squeezed to fit both: below `lg`, the
 * horizontal 7-column week grid put four narrow columns on screen at once
 * with every event's text truncated to a handful of characters — genuinely
 * unreadable, confirmed live. There, each day gets its own full-width
 * section instead, in a single vertical list, so an event's description
 * reads in full without a tooltip. `lg:` and up keeps the week-at-a-glance
 * grid, where there is actually room for it.
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

  if (days.length === 0) {
    return (
      <Card className="min-h-0">
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
    <Card className="min-h-0">
      <CardHeader>
        <CardTitle>This Week</CardTitle>
        {legend}
      </CardHeader>
      <CardContent className="dk-scroll overflow-x-auto p-2">
        {/* Mobile: one full-width section per day, stacked. */}
        <div className="flex flex-col gap-2 lg:hidden">
          {days.map((day) => (
            <div
              key={day.iso}
              className={cn(
                "rounded-lg border bg-white/[0.012]",
                day.today ? "border-quantum/40 bg-quantum/[0.04]" : "border-zinc-800/70",
              )}
            >
              <div className="flex items-baseline gap-2 border-b border-zinc-800/70 px-2.5 py-1.5 font-mono">
                <span className="text-[9px] uppercase tracking-wider text-zinc-600">{day.dow}</span>
                <span className="text-sm font-bold text-zinc-200">{day.dd}</span>
              </div>
              <div className="flex flex-col gap-1 p-1.5">
                {day.events.map((e, i) => (
                  <EventChip key={`${e.symbol}-${e.type}-${i}`} e={e} />
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: week-at-a-glance grid, column count matches how many days actually have something on them. */}
        <div
          className="hidden gap-1.5 lg:grid"
          style={{ gridTemplateColumns: `repeat(${days.length}, minmax(150px, 1fr))` }}
        >
          {days.map((day) => (
            <div
              key={day.iso}
              className={cn(
                "flex min-h-[160px] flex-col rounded-lg border bg-white/[0.012]",
                day.today ? "border-quantum/40 bg-quantum/[0.04]" : "border-zinc-800/70",
              )}
            >
              <div className="border-b border-zinc-800/70 px-2 py-1.5 font-mono">
                <div className="text-[9px] uppercase tracking-wider text-zinc-600">{day.dow}</div>
                <div className="text-sm font-bold text-zinc-200">{day.dd}</div>
              </div>
              <div className="flex flex-1 flex-col gap-1 p-1.5">
                {day.events.map((e, i) => (
                  <div key={`${e.symbol}-${e.type}-${i}`} title={`${e.symbol} — ${e.description}`}>
                    <EventChip e={e} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
