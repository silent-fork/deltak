"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, compact, fmt, money } from "@/lib/utils";
import type { BlockDeal } from "@/lib/tools/corporateCalendarTypes";

/**
 * Today's block deals — `market.getBlockDeals()`. `getBulkDeals()` (the
 * wider "bulk & block" scope originally sketched) 404'd live when probed,
 * so this stays scoped to what's actually real: block deals only.
 */
export function BlockDealsTicker({ deals }: { deals: BlockDeal[] }) {
  return (
    <Card className="min-h-0 shrink-0">
      <CardHeader>
        <CardTitle>Block Deals</CardTitle>
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Today</span>
      </CardHeader>
      <CardContent className="dk-scroll overflow-x-auto p-2">
        {deals.length === 0 ? (
          <p className="px-1 py-2 font-mono text-[10px] text-zinc-600">No block deals reported yet today.</p>
        ) : (
          <div className="flex gap-2" style={{ minWidth: `${deals.length * 190}px` }}>
            {deals.map((d, i) => (
              <div
                key={`${d.symbol}-${i}`}
                className="flex flex-1 items-center gap-2 rounded border border-zinc-800/70 bg-zinc-900/40 px-2.5 py-1.5"
              >
                <span className="font-mono text-[10.5px] font-semibold text-zinc-200">{d.symbol}</span>
                <span className="font-mono text-[10px] text-zinc-500">{money(d.price)}</span>
                <span
                  className={cn(
                    "font-mono text-[10px] tabular-nums",
                    d.changePct >= 0 ? "text-emerald-400" : "text-rose-400",
                  )}
                >
                  {d.changePct >= 0 ? "+" : ""}
                  {fmt(d.changePct)}%
                </span>
                <span className="ml-auto font-mono text-[9px] text-zinc-600">{compact(d.volume)} sh</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
