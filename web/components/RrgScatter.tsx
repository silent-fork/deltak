"use client";

import { useMemo, useState } from "react";
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
import type { RrgNode } from "@/lib/types";
import { QUADRANT_META, cn, fmt } from "@/lib/utils";

type Filter = "ALL" | "CE" | "PE";

const QUADRANT_BANDS = [
  { key: "LEADING", x: [100, 200], y: [100, 200], fill: "#10b981" },
  { key: "IMPROVING", x: [0, 100], y: [100, 200], fill: "#22d3ee" },
  { key: "WEAKENING", x: [100, 200], y: [0, 100], fill: "#f59e0b" },
  { key: "LAGGING", x: [0, 100], y: [0, 100], fill: "#f43f5e" },
] as const;

function NodeDot(props: {
  cx?: number;
  cy?: number;
  payload?: { node?: RrgNode; head?: boolean; highlighted?: boolean };
}) {
  const { cx, cy, payload } = props;
  if (cx === undefined || cy === undefined || !payload?.node) return null;
  const meta = QUADRANT_META[payload.node.quadrant];

  if (!payload.head) {
    return <circle cx={cx} cy={cy} r={1.5} fill={meta.hex} opacity={0.28} />;
  }

  return (
    <g>
      {payload.highlighted ? (
        <circle cx={cx} cy={cy} r={9} fill="none" stroke="#00f0ff" strokeWidth={1.2} />
      ) : null}
      <circle cx={cx} cy={cy} r={4.5} fill={meta.hex} fillOpacity={0.9} />
      <text
        x={cx + 7}
        y={cy + 3}
        fill="#a1a1aa"
        fontSize={8}
        fontFamily="ui-monospace, monospace"
      >
        {payload.node.label}
      </text>
    </g>
  );
}

export function RrgScatter({
  nodes,
  highlightToken,
}: {
  nodes: RrgNode[];
  highlightToken?: string | null;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [hovered, setHovered] = useState<RrgNode | null>(null);

  const visible = useMemo(
    () => (filter === "ALL" ? nodes : nodes.filter((n) => n.option_type === filter)),
    [nodes, filter],
  );

  // Symmetric domain around the 100 origin so the quadrants stay square.
  const domain = useMemo(() => {
    const spread = visible.reduce(
      (max, n) =>
        Math.max(
          max,
          Math.abs(n.rs_ratio - 100),
          Math.abs(n.rs_momentum - 100),
          ...n.tail.map((t) =>
            Math.max(Math.abs(t.rs_ratio - 100), Math.abs(t.rs_momentum - 100)),
          ),
        ),
      1.2,
    );
    const pad = Math.max(1.5, spread * 1.25);
    return [100 - pad, 100 + pad] as [number, number];
  }, [visible]);

  // Tails get noisy past a couple of dozen nodes; keep the trace readable.
  const withTails = visible.length <= 18;

  const series = useMemo(
    () =>
      visible.map((node) => {
        const tail = withTails
          ? node.tail.slice(0, -1).map((p) => ({
              x: p.rs_ratio,
              y: p.rs_momentum,
              node,
              head: false,
            }))
          : [];
        return {
          node,
          data: [
            ...tail,
            {
              x: node.rs_ratio,
              y: node.rs_momentum,
              node,
              head: true,
              highlighted: node.token === highlightToken,
            },
          ],
        };
      }),
    [visible, withTails, highlightToken],
  );

  const active = hovered;

  return (
    <Card className="shrink-0">
      <CardHeader>
        <CardTitle>RRG Momentum</CardTitle>
        <div className="flex items-center gap-1">
          {(["ALL", "CE", "PE"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider transition-colors",
                filter === f
                  ? "border-quantum/60 bg-quantum/15 text-quantum"
                  : "border-zinc-700 text-zinc-500 hover:text-zinc-300",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent className="p-2">
        <div className="h-[220px] w-full">
          {visible.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[11px] text-zinc-600">
              RRG nodes warming up…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 8, right: 14, bottom: 4, left: -14 }}>
                {QUADRANT_BANDS.map((band) => (
                  <ReferenceArea
                    key={band.key}
                    x1={band.x[0]}
                    x2={band.x[1]}
                    y1={band.y[0]}
                    y2={band.y[1]}
                    fill={band.fill}
                    fillOpacity={0.05}
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
                <ZAxis range={[24, 24]} />
                <ReferenceLine x={100} stroke="#00f0ff" strokeOpacity={0.45} />
                <ReferenceLine y={100} stroke="#00f0ff" strokeOpacity={0.45} />
                {series.map(({ node, data }) => (
                  <Scatter
                    key={node.token}
                    data={data}
                    shape={<NodeDot />}
                    line={
                      withTails
                        ? {
                            stroke: QUADRANT_META[node.quadrant].hex,
                            strokeOpacity: 0.3,
                          }
                        : false
                    }
                    isAnimationActive={false}
                    onMouseEnter={() => setHovered(node)}
                    onMouseLeave={() => setHovered(null)}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Axis legend + hovered node readout */}
        <div className="mt-1 flex items-center justify-between gap-2 px-1 text-[9px] uppercase tracking-wider text-zinc-600">
          <span>RS-Ratio →</span>
          <span>↑ RS-Momentum</span>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-1">
          {(Object.keys(QUADRANT_META) as (keyof typeof QUADRANT_META)[]).map(
            (q) => {
              const meta = QUADRANT_META[q];
              const count = visible.filter((n) => n.quadrant === q).length;
              return (
                <div
                  key={q}
                  title={meta.note}
                  className={cn(
                    "flex items-center justify-between rounded border px-1.5 py-1 text-[9px] uppercase tracking-wider",
                    meta.tone,
                  )}
                >
                  <span className="flex items-center gap-1">
                    <span className={cn("h-1 w-1 rounded-full", meta.dot)} />
                    {meta.label}
                  </span>
                  <span className="font-mono">{count}</span>
                </div>
              );
            },
          )}
        </div>

        {active ? (
          <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/70 px-2 py-1.5 font-mono text-[10px] text-zinc-400">
            <span className="text-zinc-200">{active.label}</span> · RS-Ratio{" "}
            {fmt(active.rs_ratio)} · RS-Mom {fmt(active.rs_momentum)} ·{" "}
            <span className="uppercase">{QUADRANT_META[active.quadrant].label}</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
