"use client";

import { TrendingDown, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, money } from "@/lib/utils";
import type { RadarStock } from "@/lib/tools/marketScannerTypes";

const SHORTLIST = 8;

/**
 * Calmer, second pass — the first version swept an animated scan-line over
 * a loud red/green track for every stock in a long single list, which read
 * as more spectacle than signal. This instead asks the one question a
 * screener like this exists for, "who's actually near an extreme right
 * now", and answers it directly: two short, quiet lists — nearest the
 * window low, nearest the window high — a thin neutral track with a single
 * plain fill, no motion, no glow. The full list (~200 F&O names) is real
 * but not the point; only the names worth a second look are shown.
 */
function RadarList({
  title,
  icon: Icon,
  tone,
  stocks,
}: {
  title: string;
  icon: typeof TrendingUp;
  tone: "up" | "down";
  stocks: RadarStock[];
}) {
  const fill = tone === "up" ? "bg-aegis" : "bg-zenith";
  const text = tone === "up" ? "text-aegis" : "text-zenith";

  return (
    <div className="flex-1">
      <div className="mb-1.5 flex items-center gap-1.5 px-0.5">
        <Icon className={cn("h-3 w-3", text)} />
        <span className="font-mono text-[9.5px] uppercase tracking-wider text-zinc-500">{title}</span>
      </div>
      <div className="flex flex-col gap-1">
        {stocks.map((s) => (
          <div
            key={s.symbol}
            className="grid grid-cols-[64px_1fr_44px] items-center gap-2 rounded border border-zinc-800/60 bg-zinc-900/30 px-2 py-1.5"
          >
            <span className="truncate font-mono text-[10.5px] text-zinc-200">{s.symbol}</span>
            <div className="h-1 rounded-full bg-zinc-800">
              <div
                className={cn("h-1 rounded-full", fill)}
                style={{ width: `${Math.round(s.position * 100)}%` }}
              />
            </div>
            <span className={cn("text-right font-mono text-[10px] tabular-nums", text)}>
              {Math.round(s.position * 100)}%
            </span>
          </div>
        ))}
        {stocks.length === 0 ? (
          <p className="px-0.5 font-mono text-[10px] text-zinc-600">No F&amp;O names qualify right now.</p>
        ) : null}
      </div>
    </div>
  );
}

export function RangeRadar({ stocks }: { stocks: RadarStock[] }) {
  const lows = stocks.slice(0, SHORTLIST);
  const highs = stocks.slice(-SHORTLIST).reverse();

  return (
    <Card className="min-h-0">
      <CardHeader>
        <CardTitle>Range Radar</CardTitle>
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          ~20-session high/low · {stocks.length} F&amp;O names
        </span>
      </CardHeader>
      <CardContent className="dk-scroll flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-4 sm:flex-row">
          <RadarList title="Nearest range low" icon={TrendingDown} tone="down" stocks={lows} />
          <RadarList title="Nearest range high" icon={TrendingUp} tone="up" stocks={highs} />
        </div>
        {stocks.length > 0 ? (
          <p className="mt-3 border-t border-zinc-800/70 px-0.5 pt-2 font-mono text-[9px] leading-relaxed text-zinc-600">
            Range = the highest and lowest print across the last ~20 trading sessions, from NSE&apos;s own
            bhavcopy — not a 52-week figure.{" "}
            {lows[0] ? (
              <>
                {lows[0].symbol} sits closest to its low at {money(lows[0].last)} (range{" "}
                {money(lows[0].low)}–{money(lows[0].high)}).{" "}
              </>
            ) : null}
            {highs[0] ? (
              <>
                {highs[0].symbol} sits closest to its high at {money(highs[0].last)} (range{" "}
                {money(highs[0].low)}–{money(highs[0].high)}).
              </>
            ) : null}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
