"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, compact, fmt, money } from "@/lib/utils";
import type { BlockDeal } from "@/lib/tools/corporateCalendarTypes";

/**
 * Today's block deals — `market.getBlockDeals()`. `getBulkDeals()` (the
 * wider "bulk & block" scope originally sketched) 404'd live when probed,
 * so this stays scoped to what's actually real: block deals only.
 *
 * A narrow vertical column, not a horizontal strip: a heavy deal day used to
 * make the row itself wider (or force a sideways scroll) and grow the whole
 * page's height right along with it. Fixed-width here, one deal per row,
 * with its own capped-height scroll — the panel's footprint stays put no
 * matter how many deals land, and it sits beside Recent IPOs instead of
 * stacking a third full-width band under the week view.
 *
 * The cap holds on every breakpoint, not just mobile: letting it grow
 * unbounded on desktop is what let a heavy day's content quietly outgrow
 * this card's flex-shrunk allocation and spill past the border — a fixed
 * cap on both sides of the grid row means each column caps out on its own
 * terms instead of leaning on the other to know when to stop.
 */
export function BlockDealsTicker({ deals }: { deals: BlockDeal[] }) {
  return (
    <Card className="min-h-0 shrink-0">
      <CardHeader>
        <CardTitle>Block Deals</CardTitle>
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Today</span>
      </CardHeader>
      <CardContent className="dk-scroll max-h-[280px] overflow-y-auto p-2">
        {deals.length === 0 ? (
          <p className="px-1 py-2 font-mono text-[10px] text-zinc-600">No block deals reported yet today.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {deals.map((d, i) => (
              <div
                key={`${d.symbol}-${i}`}
                className="rounded border border-zinc-800/70 bg-zinc-900/40 px-2.5 py-1.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-mono text-[10.5px] font-semibold text-zinc-200">
                    {d.symbol}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 font-mono text-[10px] tabular-nums",
                      d.changePct >= 0 ? "text-emerald-400" : "text-rose-400",
                    )}
                  >
                    {d.changePct >= 0 ? "+" : ""}
                    {fmt(d.changePct)}%
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[9px] text-zinc-600">
                  <span>{money(d.price)}</span>
                  <span>{compact(d.volume)} sh</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
