"use client";

import { memo, useMemo, useState } from "react";
import {
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmt } from "@/lib/utils";
import type { OiBuildupStock, OiQuadrant } from "@/lib/tools/volatilityDeskTypes";

const QUADRANT_META: Record<OiQuadrant, { label: string; hex: string; tone: string }> = {
  LONG_BUILDUP: { label: "Long Buildup", hex: "#10b981", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  SHORT_BUILDUP: { label: "Short Buildup", hex: "#f43f5e", tone: "border-rose-500/40 bg-rose-500/10 text-rose-300" },
  LONG_UNWINDING: { label: "Long Unwinding", hex: "#f59e0b", tone: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  SHORT_COVERING: { label: "Short Covering", hex: "#00f0ff", tone: "border-quantum/40 bg-quantum/10 text-quantum" },
};

const BANDS = [
  { key: "LONG_BUILDUP", x: [0, 200], y: [0, 200], fill: "#10b981" },
  { key: "SHORT_BUILDUP", x: [-200, 0], y: [0, 200], fill: "#f43f5e" },
  { key: "LONG_UNWINDING", x: [-200, 0], y: [-200, 0], fill: "#f59e0b" },
  { key: "SHORT_COVERING", x: [0, 200], y: [-200, 0], fill: "#00f0ff" },
] as const;

function Dot(props: {
  cx?: number;
  cy?: number;
  payload?: { stock?: OiBuildupStock; r?: number; highlighted?: boolean };
}) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload?.stock) return null;
  const meta = QUADRANT_META[payload.stock.quadrant];
  return (
    <g>
      {payload.highlighted ? (
        <circle cx={cx} cy={cy} r={(payload.r ?? 4) + 5} fill="none" stroke="#00f0ff" strokeWidth={1.2} />
      ) : null}
      <circle cx={cx} cy={cy} r={payload.r ?? 4} fill={meta.hex} fillOpacity={0.75} />
      {payload.highlighted ? (
        <text x={cx + (payload.r ?? 4) + 4} y={cy + 3} fill="#e4e4e7" fontSize={10} fontFamily="ui-monospace, monospace">
          {payload.stock.symbol}
        </text>
      ) : null}
    </g>
  );
}

/**
 * Price-change × OI-change for every F&O stock's near-month future,
 * plotted in the same quadrant grammar as the terminal's own RRG chart —
 * a deliberate reuse: Long/Short Buildup, Long Unwinding and Short
 * Covering are the option-desk's equivalent of Leading/Improving/
 * Weakening/Lagging, so the same visual language reads immediately.
 */
export const OiCompass = memo(function OiCompass({ stocks }: { stocks: OiBuildupStock[] }) {
  const [hovered, setHovered] = useState<OiBuildupStock | null>(null);

  const maxOi = useMemo(() => stocks.reduce((m, s) => Math.max(m, s.oi), 1), [stocks]);

  const domain = useMemo(() => {
    const spread = stocks.reduce(
      (m, s) => Math.max(m, Math.abs(s.priceChangePct), Math.abs(s.oiChangePct)),
      2,
    );
    const pad = Math.max(2, spread * 1.15);
    return [-pad, pad] as [number, number];
  }, [stocks]);

  const series = useMemo(
    () =>
      stocks.map((s) => ({
        stock: s,
        data: [
          {
            x: s.priceChangePct,
            y: s.oiChangePct,
            stock: s,
            r: 2.5 + (s.oi / maxOi) * 9,
            highlighted: s.symbol === hovered?.symbol,
          },
        ],
      })),
    [stocks, maxOi, hovered],
  );

  const counts = useMemo(() => {
    const c: Record<OiQuadrant, number> = {
      LONG_BUILDUP: 0,
      SHORT_BUILDUP: 0,
      LONG_UNWINDING: 0,
      SHORT_COVERING: 0,
    };
    for (const s of stocks) c[s.quadrant] += 1;
    return c;
  }, [stocks]);

  return (
    <Card className="min-h-0 border-quantum/20">
      <CardHeader>
        <CardTitle className="text-quantum">OI Buildup Compass</CardTitle>
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          {stocks.length} F&amp;O names · near-month
        </span>
      </CardHeader>
      <CardContent className="dk-scroll flex min-h-0 flex-col gap-2 overflow-y-auto p-2">
        {/*
          `lg:min-h-[160px]` lets the plot shrink on a short desktop
          viewport instead of forcing the card past its grid row's height —
          the same fix `SectorRrgChart` needed (confirmed there: without it,
          the legend/readout below the plot got clipped off the bottom of
          the card instead of the whole card scrolling).
        */}
        <div className="relative h-[300px] min-h-[220px] w-full flex-1 lg:h-full lg:min-h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 14, bottom: 4, left: -8 }}>
              {BANDS.map((b) => (
                <ReferenceArea
                  key={b.key}
                  x1={b.x[0]}
                  x2={b.x[1]}
                  y1={b.y[0]}
                  y2={b.y[1]}
                  fill={b.fill}
                  fillOpacity={0.055}
                  stroke="none"
                />
              ))}
              <CartesianGrid stroke="#27272a" strokeDasharray="2 4" />
              <XAxis
                type="number"
                dataKey="x"
                domain={domain}
                tick={{ fill: "#52525b", fontSize: 9 }}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                stroke="#3f3f46"
                allowDataOverflow
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={domain}
                tick={{ fill: "#52525b", fontSize: 9 }}
                tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                stroke="#3f3f46"
                allowDataOverflow
              />
              <ZAxis range={[10, 200]} />
              <ReferenceLine x={0} stroke="#00f0ff" strokeOpacity={0.35} />
              <ReferenceLine y={0} stroke="#00f0ff" strokeOpacity={0.35} />
              {series.map(({ stock, data }) => (
                <Scatter
                  key={stock.symbol}
                  data={data}
                  shape={<Dot />}
                  line={false}
                  isAnimationActive={false}
                  onMouseEnter={() => setHovered(stock)}
                  onMouseLeave={() => setHovered(null)}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="flex shrink-0 items-center justify-between px-1 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          <span>Price Δ →</span>
          <span>↑ OI Δ</span>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-1 sm:grid-cols-4">
          {(Object.keys(QUADRANT_META) as OiQuadrant[]).map((q) => (
            <div
              key={q}
              className={`flex items-center justify-center gap-1 rounded border px-1 py-1 text-[9px] uppercase tracking-wider ${QUADRANT_META[q].tone}`}
            >
              <span className="truncate">{QUADRANT_META[q].label}</span>
              <span className="font-mono font-semibold">{counts[q]}</span>
            </div>
          ))}
        </div>

        <div className="shrink-0 rounded border border-zinc-800 bg-zinc-950/70 px-2 py-1.5 font-mono text-[10px] text-zinc-400">
          {hovered ? (
            <span className="block truncate">
              <span className="text-zinc-200">{hovered.symbol}</span> · Price{" "}
              {hovered.priceChangePct >= 0 ? "+" : ""}
              {fmt(hovered.priceChangePct)}% · OI {hovered.oiChangePct >= 0 ? "+" : ""}
              {fmt(hovered.oiChangePct)}% ·{" "}
              <span className="uppercase">{QUADRANT_META[hovered.quadrant].label}</span>
            </span>
          ) : (
            <span className="block truncate text-[9px] uppercase tracking-wider text-zinc-600">
              Hover a dot for its price/OI move
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
