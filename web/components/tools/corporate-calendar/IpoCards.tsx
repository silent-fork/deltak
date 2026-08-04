"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RecentIpo } from "@/lib/tools/corporateCalendarTypes";

/**
 * Recent IPOs — issue price band and listing date, from NSE's own past-IPO
 * list. Height-capped with its own scroll, same reasoning as Block Deals
 * next to it: an active listing month otherwise grew this card past what
 * the grid row it shares had room for.
 */
export function IpoCards({ ipos }: { ipos: RecentIpo[] }) {
  return (
    <Card className="min-h-0 shrink-0">
      <CardHeader>
        <CardTitle>Recent IPOs</CardTitle>
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Last 60 days</span>
      </CardHeader>
      <CardContent className="dk-scroll max-h-[280px] overflow-y-auto p-2">
        {ipos.length === 0 ? (
          <p className="px-1 py-2 font-mono text-[10px] text-zinc-600">No recent listings in this window.</p>
        ) : (
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}
          >
            {ipos.map((ipo) => (
              <div
                key={ipo.symbol}
                className="rounded-lg border border-violet-400/25 bg-violet-400/[0.03] p-2.5"
              >
                <div className="truncate font-mono text-[11px] font-semibold text-zinc-200">
                  {ipo.symbol}
                </div>
                <div className="mt-1 truncate text-[9.5px] text-zinc-500">{ipo.company}</div>
                <div className="mt-2 flex items-center justify-between font-mono text-[9.5px]">
                  <span className="text-zinc-400">{ipo.priceLabel}</span>
                  <span className="text-zinc-600">{ipo.listingDate ?? "—"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
