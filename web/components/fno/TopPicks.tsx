"use client";

import { Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt, money } from "@/lib/utils";
import type { SectorPicksEntry } from "@/lib/sectors/types";

/**
 * Top 3 F&O-eligible movers inside each currently-Leading sector — the
 * user's own hard filter, verbatim: "stock with fno available only to be
 * suggested". An empty `picks` array is a legitimate outcome, not an error —
 * either the sector's constituent list is unavailable at all
 * (`constituentSlug: null` in `lib/sectors/config.ts`), or none of its
 * constituents currently carry an F&O contract (confirmed live for Media:
 * NSE's own Media index constituents currently have zero F&O-eligible
 * names between them). Rendered as a plain note rather than hidden, so it
 * is clear the sector was considered either way.
 */
export function TopPicks({ entries }: { entries: SectorPicksEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <Card className="min-h-0">
      <CardHeader>
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-quantum" />
          <CardTitle>Top F&amp;O Picks · Leading Sectors</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}
        >
          {entries.map(({ sector, picks }) => (
            <div
              key={sector}
              className="min-w-0 rounded border border-emerald-500/25 bg-emerald-500/[0.03] p-2"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-emerald-300">
                  {sector}
                </span>
                <Badge className="shrink-0 border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                  Leading
                </Badge>
              </div>
              {picks.length === 0 ? (
                <p className="font-mono text-[10px] text-zinc-600">
                  No F&amp;O-eligible constituent currently found for this sector.
                </p>
              ) : (
                <div className="flex flex-col gap-1">
                  {picks.map((p) => (
                    <div
                      key={p.symbol}
                      className="flex min-w-0 items-center gap-2 rounded bg-zinc-950/50 px-1.5 py-1"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-mono text-[11px] text-zinc-200">{p.symbol}</span>
                        <span className="ml-1.5 truncate text-[9px] text-zinc-600">
                          {p.company}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-zinc-400">
                        {money(p.lastClose)}
                      </span>
                      <span
                        className={
                          "shrink-0 font-mono text-[10px] tabular-nums " +
                          (p.changePct >= 0 ? "text-emerald-400" : "text-rose-400")
                        }
                      >
                        {p.changePct > 0 ? "+" : ""}
                        {fmt(p.changePct)}%
                      </span>
                      <span className="hidden shrink-0 font-mono text-[9px] text-zinc-600 sm:inline">
                        lot {p.lotSize}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
