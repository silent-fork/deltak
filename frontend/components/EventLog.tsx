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
    <Card className="min-h-0">
      <CardHeader>
        <CardTitle>Risk Event Log</CardTitle>
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          circuit breakers
        </span>
      </CardHeader>
      <CardContent className="max-h-[180px] overflow-y-auto p-2">
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
