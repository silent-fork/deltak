"use client";

import {
  AlertTriangle,
  CircleDot,
  Info,
  Moon,
  Octagon,
  ScrollText,
  Target,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { RiskEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_META: Record<RiskEvent["kind"], { icon: typeof Info; tone: string }> = {
  INVALIDATION: { icon: AlertTriangle, tone: "text-rose-400" },
  THESIS_BROKEN: { icon: AlertTriangle, tone: "text-rose-400" },
  DAYLIGHT_REST: { icon: Moon, tone: "text-quantum" },
  STOP_LOSS: { icon: Octagon, tone: "text-rose-400" },
  TARGET: { icon: Target, tone: "text-emerald-400" },
  PANIC: { icon: AlertTriangle, tone: "text-rose-500" },
  INFO: { icon: CircleDot, tone: "text-zinc-500" },
};

/** Kinds worth pulling the operator's eye to the button itself. */
const CRITICAL: RiskEvent["kind"][] = ["INVALIDATION", "THESIS_BROKEN", "STOP_LOSS", "PANIC"];

export function EventLogMenu({ events }: { events: RiskEvent[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // A log that swallows clicks or traps Escape is worse than no log.
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

  const alerts = events.filter((e) => CRITICAL.includes(e.kind)).length;

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Risk event log — circuit breakers, fills and session notices"
        className={cn(
          "flex h-8 items-center gap-1.5 rounded-md border px-2 font-mono text-[10px] uppercase tracking-wider transition-colors",
          open
            ? "border-quantum/60 bg-quantum/10 text-quantum"
            : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200",
        )}
      >
        <ScrollText className="h-3.5 w-3.5" />
        Logs
        <span
          className={cn(
            "rounded px-1 text-[9px] font-semibold",
            alerts > 0
              ? "bg-rose-500/20 text-rose-300"
              : "bg-zinc-800 text-zinc-500",
          )}
        >
          {events.length}
        </span>
      </button>

      {/*
        Fully opaque, with a ring and a deep shadow to lift it off the board —
        a log you read through the panel behind it is a log you misread.
      */}
      {open ? (
        <div
          role="menu"
          className="dk-scroll absolute left-0 top-full z-50 mt-1 max-h-[60vh] w-[min(30rem,calc(100vw-1.5rem))] overflow-y-auto rounded-lg border border-zinc-700 bg-[#0b0b0e] shadow-2xl shadow-black ring-1 ring-black/60"
        >
          <div className="sticky top-0 flex items-center justify-between border-b border-zinc-800 bg-[#0b0b0e] px-3 py-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-300">
              Risk Event Log
            </span>
            <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
              circuit breakers
            </span>
          </div>

          {events.length === 0 ? (
            <div className="px-3 py-6 text-center text-[11px] text-zinc-600">
              No events yet.
            </div>
          ) : (
            <ul className="p-1.5">
              {events.map((event, i) => {
                const meta = KIND_META[event.kind] ?? KIND_META.INFO;
                const Icon = meta.icon;
                return (
                  <li
                    key={`${event.ts}-${i}`}
                    className="flex items-start gap-2 rounded px-1.5 py-1 text-[10px] leading-snug hover:bg-zinc-900/70"
                  >
                    <Icon className={cn("mt-px h-3 w-3 shrink-0", meta.tone)} />
                    <span className="shrink-0 font-mono text-zinc-600">
                      {event.ts.slice(11, 19)}
                    </span>
                    <span className="flex-1 text-zinc-400">{event.message}</span>
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
