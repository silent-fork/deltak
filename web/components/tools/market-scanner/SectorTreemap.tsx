"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, fmt } from "@/lib/utils";
import type { HeatmapSector } from "@/lib/tools/marketScannerTypes";

/** −3%..+3% interpolated zenith → zinc → aegis, same read as the sector-rotation leaderboard. */
function tileColor(pct: number): string {
  const t = Math.max(-1, Math.min(1, pct / 3));
  const zinc: [number, number, number] = [63, 63, 70];
  const target: [number, number, number] = t >= 0 ? [16, 185, 129] : [244, 63, 94];
  const k = Math.min(1, Math.abs(t) * 1.4);
  const rgb = zinc.map((v, i) => Math.round(v + (target[i]! - v) * k));
  return `rgb(${rgb.join(",")})`;
}

/**
 * Every sector with a known constituent list, sized by aggregate turnover
 * (bigger block = more rupee value traded there today) and each tile
 * coloured by that stock's own change% — a treemap read straight off the
 * bulk equity bhavcopy, no per-stock live calls.
 *
 * Collapsible per sector: 13 sectors × up to 20 tiles each, always expanded,
 * turned mobile into a multi-thousand-pixel scroll with no way to just see
 * the shape of the day first. Each sector collapses to a compact heat-strip
 * (name, change%, and a thin bar of every constituent's own colour) by
 * default on a narrow viewport — tap to open the full tile grid — while a
 * desktop viewport, which actually has the width to show tiles at a glance,
 * keeps every sector open like before.
 */
export function SectorTreemap({ sectors }: { sectors: HeatmapSector[] }) {
  const sorted = [...sectors].sort((a, b) => b.weight - a.weight);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [defaultExpanded, setDefaultExpanded] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDefaultExpanded(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setDefaultExpanded(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const isOpen = (label: string) => expanded[label] ?? defaultExpanded;
  const toggle = (label: string) =>
    setExpanded((e) => ({ ...e, [label]: !isOpen(label) }));

  return (
    <Card className="min-h-0 border-quantum/20">
      <CardHeader>
        <CardTitle className="text-quantum">Sector Heatmap</CardTitle>
        <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          <span>−3%</span>
          <span
            className="h-1.5 w-24 rounded-full"
            style={{
              background: "linear-gradient(90deg,#7f1d2e,#f43f5e,#3f3f46,#10b981,#0d9467)",
            }}
          />
          <span>+3%</span>
          <span className="ml-2 flex items-center gap-1">
            <span className="h-1 w-1 rounded-full bg-quantum shadow-[0_0_5px_#00f0ff]" />
            F&amp;O
          </span>
        </div>
      </CardHeader>
      <CardContent className="dk-scroll flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-1.5 lg:flex-row lg:flex-wrap">
          {sorted.map((sector) => {
            const open = isOpen(sector.label);
            return (
              <div
                key={sector.label}
                className="rounded-lg border border-zinc-800/70 bg-white/[0.015] p-2 lg:min-w-[190px] lg:flex-1"
                style={{ flexGrow: Math.max(0.6, sector.weight / 1e9) }}
              >
                <button
                  onClick={() => toggle(sector.label)}
                  className="flex w-full items-center justify-between gap-2 px-0.5"
                >
                  <span className="flex items-center gap-1.5">
                    <ChevronDown
                      className={cn(
                        "h-3 w-3 shrink-0 text-zinc-600 transition-transform",
                        open && "rotate-180",
                      )}
                    />
                    <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">
                      {sector.label}
                    </span>
                    <span className="font-mono text-[8.5px] text-zinc-700">
                      {sector.tiles.length}
                    </span>
                  </span>
                  <span
                    className="font-mono text-[10px] font-semibold"
                    style={{ color: tileColor(sector.changePct) }}
                  >
                    {sector.changePct >= 0 ? "+" : ""}
                    {fmt(sector.changePct)}%
                  </span>
                </button>

                {open ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {sector.tiles.map((t) => (
                      <div
                        key={t.symbol}
                        title={`${t.symbol} ${t.changePct >= 0 ? "+" : ""}${t.changePct.toFixed(1)}%${t.fno ? " · F&O eligible" : ""}`}
                        className="relative min-w-[64px] flex-1 rounded-md border border-white/5 px-2 py-1.5"
                        style={{ background: tileColor(t.changePct) }}
                      >
                        <div className="truncate font-mono text-[10px] font-bold text-white [text-shadow:0_1px_2px_rgba(0,0,0,.5)]">
                          {t.symbol}
                        </div>
                        <div className="font-mono text-[9px] text-white/90 [text-shadow:0_1px_2px_rgba(0,0,0,.5)]">
                          {t.changePct >= 0 ? "+" : ""}
                          {t.changePct.toFixed(1)}%
                        </div>
                        {t.fno ? (
                          <span className="absolute right-1.5 top-1.5 h-1 w-1 rounded-full bg-quantum shadow-[0_0_5px_#00f0ff]" />
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  // Collapsed preview: one thin slice per stock, same colour
                  // scale as the tiles — the sector's shape at a glance
                  // without any of its tiles actually rendered.
                  <div className="mt-1.5 flex h-2 gap-px overflow-hidden rounded-full">
                    {sector.tiles.map((t) => (
                      <span
                        key={t.symbol}
                        className="h-full flex-1"
                        style={{ background: tileColor(t.changePct) }}
                        title={`${t.symbol} ${t.changePct >= 0 ? "+" : ""}${t.changePct.toFixed(1)}%`}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
