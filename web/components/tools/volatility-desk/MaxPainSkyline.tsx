"use client";

import { useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, fmt, money } from "@/lib/utils";
import type { IndexOptionMetrics } from "@/lib/tools/volatilityDeskTypes";

/** Strikes nearest the money read as a "skyline" — OI concentration as building height. */
export function MaxPainSkyline({ indices }: { indices: IndexOptionMetrics[] }) {
  const [active, setActive] = useState(0);
  const index = indices[Math.min(active, indices.length - 1)];

  if (!index) {
    return (
      <Card className="min-h-0">
        <CardHeader>
          <CardTitle>Max Pain Skyline</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-[160px] items-center justify-center">
          <p className="font-mono text-[10px] text-zinc-600">No option-chain data available right now.</p>
        </CardContent>
      </Card>
    );
  }

  // Nearest ~11 strikes either side of spot — the far wings carry little OI
  // and just compress everything worth seeing into a sliver.
  const spotIdx = index.strikes.reduce(
    (best, s, i) =>
      Math.abs(s.strike - index.spot) < Math.abs(index.strikes[best]!.strike - index.spot) ? i : best,
    0,
  );
  const window = index.strikes.slice(Math.max(0, spotIdx - 10), spotIdx + 11);
  const maxOi = Math.max(1, ...window.map((s) => s.oi));
  const spotPos = window.length > 1 ? (spotIdx - Math.max(0, spotIdx - 10)) / (window.length - 1) : 0.5;

  return (
    <Card className="min-h-0">
      <CardHeader>
        <CardTitle>Max Pain Skyline</CardTitle>
        <div className="flex gap-1">
          {indices.map((ix, i) => (
            <button
              key={ix.underlying}
              onClick={() => setActive(i)}
              className={cn(
                "rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-colors",
                i === active
                  ? "border-quantum/60 bg-quantum/15 text-quantum"
                  : "border-zinc-700 text-zinc-500 hover:text-zinc-300",
              )}
            >
              {ix.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <div className="mb-2 flex items-center justify-between px-1 font-mono text-[10px] text-zinc-500">
          <span>
            Spot <span className="text-zinc-200">{money(index.spot)}</span>
          </span>
          <span>
            Max Pain{" "}
            <span className="text-amber-400">
              {index.maxPainStrike !== null ? money(index.maxPainStrike) : "—"}
            </span>
          </span>
          <span>
            PCR <span className="text-zinc-200">{fmt(index.pcr)}</span>
          </span>
        </div>

        <div className="relative flex h-[130px] items-end gap-[3px] px-1">
          {window.map((s) => {
            const isMaxPain = s.strike === index.maxPainStrike;
            return (
              <div
                key={s.strike}
                title={`${s.strike} · OI ${Math.round(s.oi / 1e5)}L${isMaxPain ? " · Max Pain" : ""}`}
                className={cn(
                  "min-w-[6px] flex-1 rounded-t-sm",
                  isMaxPain ? "bg-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.5)]" : "bg-zinc-700",
                )}
                style={{ height: `${Math.max(3, (s.oi / maxOi) * 100)}%` }}
              />
            );
          })}
          <div
            className="pointer-events-none absolute bottom-[-18px] top-0 w-0 border-l border-dashed border-quantum/70"
            style={{ left: `${spotPos * 100}%` }}
          >
            <span className="absolute -bottom-4 left-1 font-mono text-[8px] uppercase tracking-wider text-quantum">
              Spot
            </span>
          </div>
        </div>
        <div className="mt-6 flex gap-[3px] px-1">
          {window.map((s, i) => (
            <span
              key={s.strike}
              className="min-w-[6px] flex-1 truncate text-center font-mono text-[7.5px] text-zinc-700"
            >
              {i % 2 === 0 ? s.strike : ""}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
