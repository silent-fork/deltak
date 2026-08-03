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
import type { Quadrant } from "@/lib/types";
import { QUADRANT_META, cn, fmt } from "@/lib/utils";
import type { SectorRotationPoint } from "@/lib/sectors/types";

const QUADRANT_BANDS = [
  { key: "LEADING", x: [100, 200], y: [100, 200], fill: "#10b981" },
  { key: "IMPROVING", x: [0, 100], y: [100, 200], fill: "#22d3ee" },
  { key: "WEAKENING", x: [100, 200], y: [0, 100], fill: "#f59e0b" },
  { key: "LAGGING", x: [0, 100], y: [0, 100], fill: "#f43f5e" },
] as const;

const SECTOR_NOTE: Record<Quadrant, string> = {
  LEADING: "Outperforming the Nifty 50 and still accelerating.",
  IMPROVING: "Turning up against the benchmark — the early-rotation zone.",
  WEAKENING: "Still ahead of the benchmark, but momentum is rolling over.",
  LAGGING: "Underperforming the Nifty 50 and still losing ground.",
};

function SectorDot(props: {
  cx?: number;
  cy?: number;
  payload?: { sector?: SectorRotationPoint; highlighted?: boolean };
}) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload?.sector) return null;
  const meta = QUADRANT_META[payload.sector.quadrant];

  return (
    <g>
      {payload.highlighted ? (
        <circle cx={cx} cy={cy} r={11} fill="none" stroke="#00f0ff" strokeWidth={1.4} />
      ) : null}
      <circle cx={cx} cy={cy} r={5.5} fill={meta.hex} fillOpacity={0.92} />
      {/*
        Only the hovered/pinned sector gets its label drawn on the plot —
        19 sectors bunch tightly enough near the origin (see the LAGGING
        quadrant in practice) that labelling every dot at once turns into an
        unreadable smear. The leaderboard beside the chart already lists
        every sector by name; this is for "which dot is that" on demand.
      */}
      {payload.highlighted ? (
        <text
          x={cx + 8}
          y={cy + 3}
          fill="#e4e4e7"
          fontSize={10}
          fontFamily="ui-monospace, monospace"
          className="select-none"
        >
          {payload.sector.label}
        </text>
      ) : null}
    </g>
  );
}

/**
 * The dashboard's focal component, per the user's own instruction: "keep
 * the component of rrg discussed above in focus of dashboard." Daily-close
 * sectors rather than live ticks — see `lib/sectors/rotation.ts` for why the
 * engine's window/lookback are tuned shorter than the live option-premium
 * plot's. Head-only scatter, no connecting path — 19 sectors' trails
 * crossing at once read as a tangle rather than history (confirmed
 * visually); the RS-Ratio/RS-Momentum position is the point, same as the
 * live `RrgScatter`.
 */
export const SectorRrgChart = memo(function SectorRrgChart({
  sectors,
  asOf,
  benchmarkLabel,
}: {
  sectors: SectorRotationPoint[];
  asOf: string;
  benchmarkLabel: string;
}) {
  const [hovered, setHovered] = useState<SectorRotationPoint | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);

  const domain = useMemo(() => {
    const spread = sectors.reduce(
      (max, s) =>
        Math.max(
          max,
          Math.abs(s.rs_ratio - 100),
          Math.abs(s.rs_momentum - 100),
          ...s.tail.map((t) => Math.max(Math.abs(t.rs_ratio - 100), Math.abs(t.rs_momentum - 100))),
        ),
      1.5,
    );
    const pad = Math.max(2, spread * 1.25);
    return [100 - pad, 100 + pad] as [number, number];
  }, [sectors]);

  const heads = useMemo(
    () =>
      sectors.map((sector) => ({
        sector,
        data: [
          {
            x: sector.rs_ratio,
            y: sector.rs_momentum,
            sector,
            highlighted: sector.bhavcopyName === (pinned ?? hovered?.bhavcopyName),
          },
        ],
      })),
    [sectors, pinned, hovered],
  );

  const active = pinned ? sectors.find((s) => s.bhavcopyName === pinned) : hovered;

  return (
    <Card className="min-h-0 border-quantum/20">
      <CardHeader className="flex-wrap gap-y-1.5">
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle className="truncate text-quantum">Sector Rotation RRG</CardTitle>
          <span className="shrink-0 rounded border border-zinc-700 px-1 font-mono text-[8px] uppercase tracking-wider text-zinc-500">
            vs {benchmarkLabel}
          </span>
        </div>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          Session {asOf}
        </span>
      </CardHeader>

      <CardContent className="dk-scroll flex min-h-0 flex-col gap-2 overflow-y-auto p-2 sm:p-3">
        {/*
          `lg:min-h-[160px]` (down from the 280/360px mobile floors) lets the
          plot actually shrink on a short desktop viewport instead of forcing
          the whole card past its allotted row height — which, since nothing
          below the plot could then fit, was clipping the quadrant legend and
          the hover readout out of view entirely (confirmed at a 700px-tall
          viewport). `overflow-y-auto` on the card itself is the fallback for
          whatever is still too tall even at that floor.
        */}
        <div className="relative h-[52vh] min-h-[280px] w-full flex-1 sm:h-[58vh] sm:min-h-[360px] lg:h-full lg:min-h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 40, bottom: 4, left: -8 }}>
              {QUADRANT_BANDS.map((band) => (
                <ReferenceArea
                  key={band.key}
                  x1={band.x[0]}
                  x2={band.x[1]}
                  y1={band.y[0]}
                  y2={band.y[1]}
                  fill={band.fill}
                  fillOpacity={0.06}
                  stroke="none"
                />
              ))}
              <CartesianGrid stroke="#27272a" strokeDasharray="2 4" />
              <XAxis
                type="number"
                dataKey="x"
                domain={domain}
                tick={{ fill: "#52525b", fontSize: 9 }}
                tickFormatter={(v: number) => v.toFixed(1)}
                stroke="#3f3f46"
                allowDataOverflow
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={domain}
                tick={{ fill: "#52525b", fontSize: 9 }}
                tickFormatter={(v: number) => v.toFixed(1)}
                stroke="#3f3f46"
                allowDataOverflow
              />
              <ZAxis range={[30, 30]} />
              <ReferenceLine x={100} stroke="#00f0ff" strokeOpacity={0.45} />
              <ReferenceLine y={100} stroke="#00f0ff" strokeOpacity={0.45} />
              {heads.map(({ sector, data }) => (
                <Scatter
                  key={sector.bhavcopyName}
                  data={data}
                  shape={<SectorDot />}
                  line={false}
                  isAnimationActive={false}
                  onMouseEnter={() => setHovered(sector)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() =>
                    setPinned((p) => (p === sector.bhavcopyName ? null : sector.bhavcopyName))
                  }
                  className="cursor-pointer"
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 px-1 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          <span>RS-Ratio →</span>
          <span>↑ RS-Momentum</span>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-1 sm:grid-cols-4">
          {(Object.keys(QUADRANT_META) as Quadrant[]).map((q) => {
            const meta = QUADRANT_META[q];
            const count = sectors.filter((s) => s.quadrant === q).length;
            return (
              <div
                key={q}
                title={SECTOR_NOTE[q]}
                className={cn(
                  "flex min-w-0 items-center justify-center gap-1 rounded border px-1 py-1 text-[9px] uppercase tracking-wider",
                  meta.tone,
                  count === 0 && "opacity-45",
                )}
              >
                <span className={cn("h-1 w-1 shrink-0 rounded-full", meta.dot)} />
                <span className="truncate">{meta.label}</span>
                <span className="font-mono font-semibold">{count}</span>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 rounded border border-zinc-800 bg-zinc-950/70 px-2 py-1.5 font-mono text-[10px] leading-[16px] text-zinc-400">
          {active ? (
            <span className="block truncate">
              <span className="text-zinc-200">{active.label}</span> · RS-Ratio {fmt(active.rs_ratio)}{" "}
              · RS-Mom {fmt(active.rs_momentum)} · {fmt(active.changePct)}%{" "}
              <span className="uppercase">{QUADRANT_META[active.quadrant].label}</span>
              <span className="ml-2 text-zinc-600">{SECTOR_NOTE[active.quadrant]}</span>
            </span>
          ) : (
            <span className="block truncate text-[9px] uppercase tracking-wider text-zinc-600">
              Hover or tap a sector for its RS coordinates
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
});
