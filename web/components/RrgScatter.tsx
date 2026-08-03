"use client";

import { ArrowLeftRight, Loader2, TrendingDown, TrendingUp, Waves } from "lucide-react";
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

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton, SkeletonPanel } from "@/components/ui/skeleton";
import { DEFAULT_CONFIG, INDEX_UNIVERSE } from "@/lib/engine/config";
import type { OptionChain, Protocol, RrgNode, Signal } from "@/lib/types";
import { PROTOCOL_META, QUADRANT_META, cn, fmt } from "@/lib/utils";

/** A translucent loader stays up until this much of the expected node count has matured. */
const RRG_READY_FRACTION = 0.9;

type Filter = "ALL" | "CE" | "PE";

/** One glance at the shape of the regime, ahead of reading its name. */
const PROTOCOL_ICON: Record<Protocol, typeof ArrowLeftRight> = {
  ALPHA: ArrowLeftRight,
  BETA: TrendingUp,
  GAMMA: TrendingDown,
  DELTA: Waves,
};

const QUADRANT_BANDS = [
  { key: "LEADING", x: [100, 200], y: [100, 200], fill: "#10b981" },
  { key: "IMPROVING", x: [0, 100], y: [100, 200], fill: "#22d3ee" },
  { key: "WEAKENING", x: [100, 200], y: [0, 100], fill: "#f59e0b" },
  { key: "LAGGING", x: [0, 100], y: [0, 100], fill: "#f43f5e" },
] as const;

function NodeDot(props: {
  cx?: number;
  cy?: number;
  payload?: {
    node?: RrgNode;
    head?: boolean;
    highlighted?: boolean;
    labelled?: boolean;
  };
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
      {/*
        Strikes cluster tightly around the 100/100 origin, so past a dozen nodes
        the labels stack into an unreadable smear. Beyond that only the signal's
        own node keeps its tag; the rest are available on hover.
      */}
      {payload.labelled || payload.highlighted ? (
        <text
          x={cx + 7}
          y={cy + 3}
          fill={payload.highlighted ? "#e4e4e7" : "#a1a1aa"}
          fontSize={8}
          fontFamily="ui-monospace, monospace"
        >
          {payload.node.label}
        </text>
      ) : null}
    </g>
  );
}

/**
 * Memoized: this is a Recharts `ScatterChart` (a full SVG layout pass), and
 * `nodes` only gets a new array when the engine's RRG cache actually
 * recomputed it — see the per-underlying cache in `useEngine`'s
 * `buildSnapshot`. A shallow-equal `nodes` means the plot has nothing new to
 * lay out.
 */
export const RrgScatter = memo(function RrgScatter({
  nodes,
  highlightToken,
  signal,
  settled = false,
  asOf = null,
  chain,
}: {
  nodes: RrgNode[];
  highlightToken?: string | null;
  /** Renders the regime read-out beneath the plot when supplied. */
  signal?: Signal;
  /** The board is frozen on a finished session — this plot is not rotating. */
  settled?: boolean;
  /** Which session it is frozen on, `YYYY-MM-DD`. */
  asOf?: string | null;
  /** For sizing the "still maturing" read-out against how many nodes this chain can actually produce. */
  chain?: OptionChain;
}) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [hovered, setHovered] = useState<RrgNode | null>(null);

  const visible = useMemo(
    () => (filter === "ALL" ? nodes : nodes.filter((n) => n.option_type === filter)),
    [nodes, filter],
  );

  /**
   * How many nodes this chain can ultimately produce — every quoted leg
   * within the same strike window `useEngine` builds the rotation from —
   * against how many have actually matured into a node so far. A live RRG
   * node needs a lookback window of real prints before its RS-Ratio means
   * anything, so a fresh session (or a fresh underlying) fills in over the
   * next minute rather than all at once, and a thin strike may never quote
   * at all — hence a 90% bar, not 100%, so one dead leg doesn't hold the
   * loader up forever.
   */
  const expected = useMemo(() => {
    if (!chain?.rows.length || !chain.atm_strike) return 0;
    const spec = INDEX_UNIVERSE[chain.underlying];
    if (!spec) return 0;
    const span = spec.strikeStep * DEFAULT_CONFIG.rrgNodeSpan;
    let count = 0;
    for (const row of chain.rows) {
      if (Math.abs(row.strike - chain.atm_strike) > span) continue;
      if (row.call && row.call.ltp > 0) count += 1;
      if (row.put && row.put.ltp > 0) count += 1;
    }
    return count;
  }, [chain]);

  const readyFraction =
    (chain && INDEX_UNIVERSE[chain.underlying]?.rrgReadyFraction) ?? RRG_READY_FRACTION;

  // A static replay lands its whole session at once — nothing to wait on.
  const maturing =
    !settled && expected > 0 && nodes.length < Math.ceil(expected * readyFraction);

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

  const withLabels = visible.length <= 12;

  /**
   * Head-only, no trail.
   *
   * A live tail was a minute of one-second samples — a short comma behind the
   * node — but a replayed session's twelve five-minute jumps sprawled right
   * across the plot, and filtering to CE/PE alone (fewer nodes, so the trail
   * count no longer needed the crowd-based cap that used to suppress it) made
   * the crossed lines the loudest thing on screen instead of the rotation
   * itself. Position is the point on a live plot as much as a settled one;
   * this also drops the per-node trail slicing a closed-market replay used to
   * redo on every batch that landed, for one render pass instead of several.
   */
  const series = useMemo(
    () =>
      visible.map((node) => ({
        node,
        data: [
          {
            x: node.rs_ratio,
            y: node.rs_momentum,
            node,
            head: true,
            labelled: withLabels,
            highlighted: node.token === highlightToken,
          },
        ],
      })),
    [visible, withLabels, highlightToken],
  );

  const active = hovered;

  const protocol = signal ? PROTOCOL_META[signal.protocol] : null;

  return (
    <Card className="min-h-0">
      <CardHeader className="shrink-0">
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle className="truncate">RRG Momentum</CardTitle>
          {/* Rotation is a claim about movement. When the market is shut this
              plot is a photograph of the last session, and says so rather than
              letting a still frame pass for a live one. */}
          {settled ? (
            <span
              title={`Static — the rotation is the last completed session${asOf ? ` (${asOf})` : ""}, replayed from historical candles. Nothing advances until the next print.`}
              className="shrink-0 rounded border border-zinc-700 px-1 font-mono text-[8px] uppercase tracking-wider text-zinc-500"
            >
              Static{asOf ? ` · ${asOf.slice(5)}` : ""}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
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

      <CardContent className="dk-scroll flex min-h-0 flex-col overflow-y-auto p-2">
        {/* The plot takes the column's leftover height so the card ends flush. */}
        <div className="relative min-h-[150px] w-full flex-1">
          {visible.length === 0 ? (
            <SkeletonPanel
              label={
                expected > 0
                  ? `0/${expected} nodes matured — waiting for a genuine price move`
                  : "Loading rotation nodes"
              }
              className="h-full"
            >
              {/* The plot's own geometry — quadrants and a scatter of nodes —
                  rather than a filled slab where the chart will be. */}
              <div className="relative h-full min-h-0 w-full rounded-md border border-zinc-800/70">
                <span className="absolute left-1/2 top-0 h-full w-px bg-zinc-800/60" />
                <span className="absolute left-0 top-1/2 h-px w-full bg-zinc-800/60" />
                {[
                  ["28%", "34%"],
                  ["62%", "22%"],
                  ["44%", "58%"],
                  ["71%", "66%"],
                ].map(([left, top]) => (
                  <Skeleton
                    key={`${left}-${top}`}
                    className="absolute h-2 w-2 rounded-full"
                    style={{ left, top }}
                  />
                ))}
                {/*
                  A chain that has legs quoting but zero matured nodes is a
                  different state from "the chain doesn't exist yet" — the
                  bare geometric skeleton above says the latter; this says the
                  pipeline is live and is specifically waiting on a real print,
                  which on a thin instrument can be the actual bottleneck.
                */}
                {expected > 0 ? (
                  <div className="absolute inset-0 flex items-center justify-center gap-1.5 px-2 text-center">
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin text-quantum" />
                    <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                      0/{expected} matured — awaiting a genuine price move
                    </span>
                  </div>
                ) : null}
              </div>
            </SkeletonPanel>
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
                    line={false}
                    isAnimationActive={false}
                    onMouseEnter={() => setHovered(node)}
                    onMouseLeave={() => setHovered(null)}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          )}

          {/* Translucent, not opaque — nodes are already real and placed
              correctly, so blacking them out would be lying about how much
              is actually known. This just says the picture isn't finished
              yet. */}
          {visible.length > 0 && maturing ? (
            <div
              role="status"
              aria-live="polite"
              className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-md bg-zinc-950/55 backdrop-blur-[1px]"
            >
              <Loader2 className="h-3 w-3 animate-spin text-quantum" />
              <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-400">
                Maturing nodes · {nodes.length}/{expected}
              </span>
            </div>
          ) : null}
        </div>

        {/* Axis legend + hovered node readout */}
        <div className="shrink-0 mt-1 flex items-center justify-between gap-2 px-1 text-[9px] uppercase tracking-wider text-zinc-600">
          <span>RS-Ratio →</span>
          <span>↑ RS-Momentum</span>
        </div>

        {/* Quadrant census — one row so the panel keeps its vertical budget */}
        <div className="shrink-0 mt-1.5 grid grid-cols-4 gap-1">
          {(Object.keys(QUADRANT_META) as (keyof typeof QUADRANT_META)[]).map(
            (q) => {
              const meta = QUADRANT_META[q];
              const count = visible.filter((n) => n.quadrant === q).length;
              return (
                <div
                  key={q}
                  title={meta.note}
                  className={cn(
                    "flex min-w-0 items-center justify-center gap-1 rounded border px-1 py-1 text-[9px] uppercase tracking-wider",
                    meta.tone,
                    count === 0 && "opacity-45",
                  )}
                >
                  <span className={cn("h-1 w-1 shrink-0 rounded-full", meta.dot)} />
                  <span className="truncate">{meta.label.slice(0, 4)}</span>
                  <span className="font-mono font-semibold">{count}</span>
                </div>
              );
            },
          )}
        </div>

        {/* Reserve the readout's row so hovering does not reflow the sidebar. */}
        <div className="shrink-0 mt-1.5 h-[26px] rounded border border-zinc-800 bg-zinc-950/70 px-2 py-1 font-mono text-[10px] leading-[16px] text-zinc-400">
          {active ? (
            <span className="block truncate">
              <span className="text-zinc-200">{active.label}</span> · RS-Ratio{" "}
              {fmt(active.rs_ratio)} · RS-Mom {fmt(active.rs_momentum)} ·{" "}
              <span className="uppercase">
                {QUADRANT_META[active.quadrant].label}
              </span>
            </span>
          ) : (
            <span className="block truncate text-[9px] uppercase tracking-wider text-zinc-600">
              Hover a node for its RS coordinates
            </span>
          )}
        </div>

        {/* Regime read-out — which protocol the quadrant picture has selected.
            The medallion reuses `protocol.tone` wholesale (border, fill and
            text all come from that one class string), so the icon picks up
            the regime's colour for free instead of a second colour map. */}
        {signal && protocol ? (
          (() => {
            const Icon = PROTOCOL_ICON[signal.protocol];
            return (
              <div className="mt-1.5 rounded-md border border-zinc-800 bg-zinc-950/50 p-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-md border",
                      protocol.tone,
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-zinc-200">
                    {protocol.title}
                  </span>
                  <Badge className={cn("shrink-0 font-semibold", protocol.tone)}>
                    {protocol.name}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-[9px] leading-snug text-zinc-500">
                  {protocol.blurb}
                </p>
                <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-zinc-800/70 pt-1.5">
                  <span className="min-w-0 truncate font-mono text-[10px] text-zinc-300">
                    {signal.trading_symbol ?? "No target node"}
                  </span>
                  <span
                    className={cn(
                      "flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider",
                      signal.actionable
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                        : "border-zinc-700 bg-zinc-900/60 text-zinc-500",
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        signal.actionable ? "bg-emerald-400 animate-pulse-ring" : "bg-zinc-600",
                      )}
                    />
                    {signal.actionable ? "Armed" : "Standby"}
                  </span>
                </div>
              </div>
            );
          })()
        ) : null}
      </CardContent>
    </Card>
  );
});
