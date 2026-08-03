"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { QUADRANT_META, cn, fmt } from "@/lib/utils";
import type { SectorRotationPoint } from "@/lib/sectors/types";

/**
 * Every sector, ranked by RS-Ratio — the RRG chart's own ordering, just
 * legible without hovering a dot. `auto-fill`/`minmax` rather than a fixed
 * column count: a phone gets one dense column, a wide monitor fills out to
 * as many as fit, with no breakpoint to maintain by hand.
 *
 * Below `lg` this is capped with its own internal scroll instead of laying
 * out all 19 rows at full height, which pushed the whole page down a full
 * extra screen on mobile for no reason. At `lg` and up it goes back to
 * stretching to match the RRG chart's height, same as before — there is
 * room for it there.
 */
export function SectorLeaderboard({ sectors }: { sectors: SectorRotationPoint[] }) {
  return (
    <Card className="min-h-0 max-h-[380px] lg:max-h-none">
      <CardHeader>
        <CardTitle>Sector Leaderboard</CardTitle>
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          {sectors.length} sectors
        </span>
      </CardHeader>
      <CardContent className="dk-scroll min-h-0 overflow-y-auto p-2">
        <div
          className="grid gap-1.5"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}
        >
          {sectors.map((s, i) => {
            const meta = QUADRANT_META[s.quadrant];
            return (
              <div
                key={s.bhavcopyName}
                className="flex min-w-0 items-center gap-2 rounded border border-zinc-800/70 bg-zinc-900/40 px-2 py-1.5"
              >
                <span className="w-4 shrink-0 text-right font-mono text-[10px] text-zinc-600">
                  {i + 1}
                </span>
                <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", meta.dot)} />
                <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-zinc-200">
                  {s.label}
                </span>
                <span
                  className={cn(
                    "shrink-0 font-mono text-[10px] tabular-nums",
                    s.changePct > 0
                      ? "text-emerald-400"
                      : s.changePct < 0
                        ? "text-rose-400"
                        : "text-zinc-500",
                  )}
                >
                  {s.changePct > 0 ? "+" : ""}
                  {fmt(s.changePct)}%
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded border px-1 py-0.5 font-mono text-[8px] uppercase tracking-wider",
                    meta.tone,
                  )}
                >
                  {meta.label.slice(0, 4)}
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
