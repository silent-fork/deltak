"use client";

import {
  AlertTriangle,
  CircleDot,
  Info,
  Moon,
  Octagon,
  Target,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RiskEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_META: Record<
  RiskEvent["kind"],
  { icon: typeof Info; tone: string }
> = {
  INVALIDATION: { icon: AlertTriangle, tone: "text-rose-400" },
  DAYLIGHT_REST: { icon: Moon, tone: "text-quantum" },
  STOP_LOSS: { icon: Octagon, tone: "text-rose-400" },
  TARGET: { icon: Target, tone: "text-emerald-400" },
  PANIC: { icon: AlertTriangle, tone: "text-rose-500" },
  INFO: { icon: CircleDot, tone: "text-zinc-500" },
};

export function EventLog({ events }: { events: RiskEvent[] }) {
  return (
    // basis-0 so the log, not the signal panel, absorbs the sidebar's slack.
    <Card className="min-h-0 shrink-0 xl:flex-1 xl:basis-0 xl:min-h-[104px]">
      <CardHeader className="shrink-0">
        <CardTitle className="truncate">Risk Event Log</CardTitle>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          {events.length ? `${events.length} · ` : ""}circuit breakers
        </span>
      </CardHeader>
      {/* Capped on small screens, absorbs the sidebar's slack on large ones. */}
      <CardContent className="dk-scroll min-h-0 max-h-[180px] flex-1 overflow-y-auto p-2 xl:max-h-none">
        {events.length === 0 ? (
          <div className="py-4 text-center text-[11px] text-zinc-600">
            No events yet.
          </div>
        ) : (
          <ul className="space-y-1">
            {events.map((event, i) => {
              const meta = KIND_META[event.kind] ?? KIND_META.INFO;
              const Icon = meta.icon;
              return (
                <li
                  key={`${event.ts}-${i}`}
                  className="flex items-start gap-1.5 rounded px-1 py-0.5 text-[10px] leading-snug"
                >
                  <Icon className={cn("mt-px h-3 w-3 shrink-0", meta.tone)} />
                  <span className="font-mono text-zinc-600">
                    {event.ts.slice(11, 19)}
                  </span>
                  <span className="flex-1 text-zinc-400">{event.message}</span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
