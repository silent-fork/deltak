"use client";

import { useMemo } from "react";

import { CardContent } from "@/components/ui/card";
import {
  OI_BUILDUP_EXPIRIES,
  OI_BUILDUP_TYPES,
  type OiBuildupExpiry,
  type OiBuildupType,
} from "@/lib/market/constants";
import type { OiBuildupRow } from "@/lib/types";
import { cn, compact, fmt, signed } from "@/lib/utils";

/**
 * Market-wide OI buildup.
 *
 * Price and open interest read together classify what is actually happening in
 * a contract: both rising is fresh long money, price falling while OI rises is
 * fresh shorts, and either one falling while OI drains is a position being
 * closed rather than opened. The COA panel asks that question of one wall on
 * one index — this asks it of the whole F&O board, which is where the flow that
 * eventually moves the index shows up first.
 */

const TAB: Record<OiBuildupType, { short: string; tone: string; blurb: string }> = {
  "Long Built Up": {
    short: "Long Build",
    tone: "border-emerald-500/50 bg-emerald-500/10 text-emerald-300",
    blurb: "Price up, open interest up — fresh long positions being opened.",
  },
  "Short Built Up": {
    short: "Short Build",
    tone: "border-rose-500/50 bg-rose-500/10 text-rose-300",
    blurb: "Price down, open interest up — fresh short positions being opened.",
  },
  "Short Covering": {
    short: "Covering",
    tone: "border-cyan-400/50 bg-cyan-400/10 text-cyan-300",
    blurb: "Price up, open interest down — shorts buying back. Squeeze fuel.",
  },
  "Long Unwinding": {
    short: "Unwinding",
    tone: "border-amber-500/50 bg-amber-500/10 text-amber-300",
    blurb: "Price down, open interest down — longs walking away.",
  },
};

const MAX_ROWS = 14;

export function OiBuildupPanel({
  rows,
  type,
  expiry,
  updatedAt,
  available,
  focus,
  onType,
  onExpiry,
}: {
  rows: OiBuildupRow[];
  type: OiBuildupType;
  expiry: OiBuildupExpiry;
  updatedAt: string | null;
  /** Historical/market-data endpoints need a broker session. */
  available: boolean;
  /** Underlying the terminal is focused on — its own contracts are marked. */
  focus: string;
  onType: (t: OiBuildupType) => void;
  onExpiry: (e: OiBuildupExpiry) => void;
}) {
  const meta = TAB[type];

  /** Biggest OI moves first — the list is long and only the head matters. */
  const ranked = useMemo(
    () =>
      [...rows]
        .sort((a, b) => Math.abs(b.oi_change) - Math.abs(a.oi_change))
        .slice(0, MAX_ROWS),
    [rows],
  );

  return (
    // Body only — the deck owns the card and the tab strip.
    <CardContent className="flex min-h-0 flex-col gap-1.5 p-2">
      <div className="flex shrink-0 items-center gap-1">
          <div className="grid flex-1 grid-cols-4 gap-1">
            {OI_BUILDUP_TYPES.map((t) => (
              <button
                key={t}
                onClick={() => onType(t)}
                title={TAB[t].blurb}
                className={cn(
                  "truncate rounded border px-1 py-1 font-mono text-[9px] uppercase tracking-wider transition-colors",
                  type === t
                    ? TAB[t].tone
                    : "border-zinc-800 text-zinc-500 hover:text-zinc-300",
                )}
              >
                {TAB[t].short}
              </button>
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1 border-l border-zinc-800 pl-1">
            {OI_BUILDUP_EXPIRIES.map((e) => (
              <button
                key={e}
                onClick={() => onExpiry(e)}
                title={`${e === "NEAR" ? "Nearest" : e === "NEXT" ? "Next" : "Far"} expiry contracts.`}
                className={cn(
                  "rounded border px-1 py-1 font-mono text-[9px] uppercase tracking-wider transition-colors",
                  expiry === e
                    ? "border-quantum/60 bg-quantum/15 text-quantum"
                    : "border-zinc-800 text-zinc-500 hover:text-zinc-300",
                )}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <p className="shrink-0 text-[9px] leading-tight text-zinc-500">{meta.blurb}</p>

        {!available ? (
          <div className="flex flex-1 items-center justify-center rounded-md border border-zinc-800/70 bg-zinc-950/40 p-3 text-center text-[10px] text-zinc-600">
            Connect a SmartAPI session to read market-wide OI buildup.
          </div>
        ) : !ranked.length ? (
          <div className="flex flex-1 items-center justify-center rounded-md border border-zinc-800/70 bg-zinc-950/40 p-3 text-center text-[10px] text-zinc-600">
            No {meta.short.toLowerCase()} contracts reported for the {expiry.toLowerCase()} expiry.
          </div>
        ) : (
          <div className="dk-scroll min-h-0 flex-1 overflow-y-auto rounded-md border border-zinc-800/70">
            <table className="w-full border-collapse font-mono text-[10px]">
              <thead className="sticky top-0 z-10 bg-zinc-950/95">
                <tr className="text-[8px] uppercase tracking-wider text-zinc-600">
                  <th className="px-1.5 py-1 text-left font-medium">Contract</th>
                  <th className="px-1.5 py-1 text-right font-medium">LTP</th>
                  <th className="px-1.5 py-1 text-right font-medium">Chg%</th>
                  <th className="px-1.5 py-1 text-right font-medium">OI</th>
                  <th className="px-1.5 py-1 text-right font-medium">ΔOI</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((row) => {
                  const mine = row.trading_symbol.startsWith(focus);
                  return (
                    <tr
                      key={row.symbol_token || row.trading_symbol}
                      className={cn(
                        "border-t border-zinc-900",
                        mine && "bg-quantum/[0.07]",
                      )}
                    >
                      <td
                        title={row.trading_symbol}
                        className={cn(
                          "max-w-0 truncate px-1.5 py-1",
                          mine ? "text-quantum" : "text-zinc-300",
                        )}
                      >
                        {row.trading_symbol}
                      </td>
                      <td className="px-1.5 py-1 text-right text-zinc-300">
                        {fmt(row.ltp)}
                      </td>
                      <td
                        className={cn(
                          "px-1.5 py-1 text-right",
                          row.percent_change >= 0
                            ? "text-emerald-400"
                            : "text-rose-400",
                        )}
                      >
                        {signed(row.percent_change)}
                      </td>
                      <td className="px-1.5 py-1 text-right text-zinc-400">
                        {compact(row.open_interest)}
                      </td>
                      <td
                        className={cn(
                          "px-1.5 py-1 text-right",
                          row.oi_change >= 0 ? "text-zinc-200" : "text-amber-400",
                        )}
                      >
                        {compact(row.oi_change)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between text-[8px] uppercase tracking-wider text-zinc-600">
          <span>
            {available && rows.length
              ? `Top ${ranked.length} of ${rows.length} by ΔOI`
              : "Market-wide · all underlyings"}
          </span>
          <span>
            {updatedAt
              ? new Date(updatedAt).toLocaleTimeString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  hour12: false,
                })
              : "—"}
          </span>
        </div>
    </CardContent>
  );
}
