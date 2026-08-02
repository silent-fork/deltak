"use client";

import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { memo } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  coaMetrics,
  marketPressure,
  triggerBands,
  wallDepth,
  wallMerged,
} from "@/lib/coaView";
import { Skeleton, SkeletonPanel } from "@/components/ui/skeleton";
import { DEFAULT_CONFIG } from "@/lib/engine/config";
import type { OiPoint, OptionChain } from "@/lib/types";
import { cn, compact, fmt, signed } from "@/lib/utils";

/**
 * COA (Chart of Accuracy) — the two walls, how thick they are, how far spot sits
 * from each, and which side the session's writing is landing on.
 */

function Section({
  label,
  hint,
  children,
  right,
}: {
  label: string;
  hint: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="shrink-0 rounded-md border border-zinc-800 bg-zinc-950/50 px-2 py-0.5">
      <div className="flex items-baseline justify-between gap-2">
        <span title={hint} className="dk-label text-[9px] leading-none">
          {label}
        </span>
        {right}
      </div>
      {children}
    </div>
  );
}

const MW = 600;
const MH = 100;

/**
 * A wall's open interest through the session, from the historical OI API.
 *
 * The wall's *level* only says where writers stood; this says whether they are
 * still standing there. A line still climbing into the afternoon is a bound
 * being reinforced; one rolling over is the wall coming down a strike or two
 * before price ever tests it.
 */
function OiCurve({
  side,
  series,
  strike,
}: {
  side: "aegis" | "zenith";
  series: OiPoint[];
  strike: number | null;
}) {
  const support = side === "aegis";
  const name = support ? "Aegis" : "Zenith";
  const values = series.map((p) => p.oi).filter((v) => v > 0);

  if (values.length < 2) {
    return (
      <div className="rounded border border-zinc-800/80 px-1.5 py-0.5">
        <div className="flex items-baseline justify-between font-mono text-[8px] text-zinc-600">
          <span className="uppercase tracking-wider">{name} OI</span>
          <span>{series.length ? "1 read" : "—"}</span>
        </div>
        <div className="mt-0.5 h-[12px] text-[8px] leading-[12px] text-zinc-700">
          awaiting history
        </div>
      </div>
    );
  }

  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const w = 100;
  const h = 18;
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * w},${h - ((v - lo) / span) * h}`)
    .join(" ");

  const net = values[values.length - 1] - values[0];
  const building = net >= 0;
  // Building reads in the wall's own colour; unwinding reads amber wherever it
  // happens, because an unwinding wall is the same warning on either side.
  const stroke = building ? (support ? "#34d399" : "#fb7185") : "#fbbf24";

  return (
    <div
      title={`${name}${strike ? ` ${fmt(strike, 0)}` : ""} — ${values.length} readings this session, ${
        building ? "net build" : "net unwind"
      } of ${compact(Math.abs(net))} contracts (historical OI API).`}
      className="rounded border border-zinc-800/80 px-1.5 py-0.5"
    >
      <div className="flex items-baseline justify-between gap-1 font-mono text-[8px]">
        <span className="uppercase tracking-wider text-zinc-500">{name} OI</span>
        <span className={building ? "text-zinc-400" : "text-amber-400/90"}>
          {signed(net / 1000, 1)}K
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        className="mt-0.5 h-[12px] w-full"
        role="img"
        aria-label={`${name} open interest through the session`}
      >
        <polyline
          points={points}
          fill="none"
          stroke={stroke}
          strokeWidth={1.4}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

/**
 * Wall migration.
 *
 * Both walls' strike history, stepped rather than smoothed — a wall does not
 * drift, it jumps from one strike to the next as writers rebuild it, and the
 * shape of those jumps is what separates a solid bound from a fleeing one.
 */
function WallMigration({
  aegis,
  zenith,
  spot,
  historical = false,
}: {
  aegis: number[];
  zenith: number[];
  spot: number;
  /** True when the trail came from the session's OI history, not this tab. */
  historical?: boolean;
}) {
  const series = [...aegis, ...zenith, spot].filter((v) => v > 0);
  const enough = aegis.length > 1 || zenith.length > 1;

  const lo = enough ? Math.min(...series) : 0;
  const hi = enough ? Math.max(...series) : 0;
  const pad = Math.max((hi - lo) * 0.18, 1);
  const top = hi + pad;
  const bottom = lo - pad;
  const span = top - bottom || 1;

  const y = (v: number) => ((top - v) / span) * MH;
  const step = (points: number[]) => {
    if (points.length < 2) return "";
    const dx = MW / (points.length - 1);
    // Hold each level, then jump — a staircase, not an interpolation.
    return points
      .map((v, i) =>
        i === 0
          ? `M0,${y(v)}`
          : `L${i * dx},${y(points[i - 1])} L${i * dx},${y(v)}`,
      )
      .join(" ");
  };

  return (
    <div className="relative flex min-h-[28px] flex-1 flex-col overflow-hidden rounded-md border border-zinc-800 bg-zinc-950/50 px-2 pb-1 pt-1">
      <div className="flex shrink-0 items-baseline justify-between">
        <span
          title="Every strike each wall has occupied this session. A wall that steps repeatedly is a wall being rebuilt; a flat line is a bound holding."
          className="dk-label text-[9px] leading-none"
        >
          Wall Migration
        </span>
        <span
          title={
            historical
              ? "Rebuilt from the session's open-interest history — the same COA 2.0 rule applied at every 15-minute bucket."
              : "Accumulated while this tab has been open."
          }
          className="font-mono text-[9px] text-zinc-600"
        >
          {enough
            ? `${Math.max(aegis.length, zenith.length)} ${historical ? "buckets" : "reads"}`
            : "warming"}
        </span>
      </div>

      <div className="relative mt-1 min-h-0 flex-1">
        {!enough ? (
          <div className="flex h-full items-center justify-center text-[10px] text-zinc-600">
            Tracking wall movement…
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${MW} ${MH}`}
            preserveAspectRatio="none"
            className="h-full w-full"
            role="img"
            aria-label="Strike history of the Aegis and Zenith walls"
          >
            {/* Spot, for reference against the bounds */}
            {spot > 0 ? (
              <line
                x1={0}
                y1={y(spot)}
                x2={MW}
                y2={y(spot)}
                stroke="#00f0ff"
                strokeWidth={1}
                strokeDasharray="2 5"
                opacity={0.5}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}

            {aegis.length > 1 ? (
              <path
                d={step(aegis)}
                fill="none"
                stroke="#34d399"
                strokeWidth={1.6}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {zenith.length > 1 ? (
              <path
                d={step(zenith)}
                fill="none"
                stroke="#fb7185"
                strokeWidth={1.6}
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
          </svg>
        )}
      </div>
    </div>
  );
}

function Wall({
  side,
  vanguard,
  live,
  shift,
  distance,
  spot,
}: {
  side: "aegis" | "zenith";
  vanguard: number | null;
  live: number | null;
  shift: number;
  distance: number | null;
  spot: number;
}) {
  const support = side === "aegis";
  const name = support ? "Aegis" : "Zenith";
  const merged = vanguard !== null && vanguard === live;

  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1",
        support
          ? "border-emerald-500/25 bg-emerald-500/[0.05]"
          : "border-rose-500/25 bg-rose-500/[0.05]",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={cn(
            "text-[9px] font-semibold uppercase tracking-[0.18em]",
            support ? "text-emerald-400" : "text-rose-400",
          )}
        >
          {name}
        </span>
        <span
          title={
            shift === 0
              ? `${name} has held its strike this session.`
              : `${name} has migrated ${Math.abs(shift)} strike step${Math.abs(shift) === 1 ? "" : "s"} ${shift > 0 ? "up" : "down"}.`
          }
          className={cn(
            "flex items-center gap-0.5 rounded px-1 py-px font-mono text-[9px] font-semibold",
            shift === 0
              ? "bg-zinc-800/70 text-zinc-500"
              : shift > 0
                ? "bg-emerald-500/15 text-emerald-300"
                : "bg-rose-500/15 text-rose-300",
          )}
        >
          {shift === 0 ? (
            <Minus className="h-2.5 w-2.5" />
          ) : shift > 0 ? (
            <ArrowUp className="h-2.5 w-2.5" />
          ) : (
            <ArrowDown className="h-2.5 w-2.5" />
          )}
          {shift === 0 ? "held" : Math.abs(shift)}
        </span>
      </div>

      <div className="mt-0.5 flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-mono text-[15px] font-semibold leading-none tracking-tight",
            support ? "text-emerald-200" : "text-rose-200",
          )}
        >
          {live !== null ? fmt(live, 0) : "—"}
        </span>
        {/* Only name the cumulative wall when it stands somewhere else. */}
        {!merged && vanguard !== null ? (
          <span
            title={`${name} Vanguard — the cumulative open-interest wall, held ahead of the live one. Where the bound settles if today's writing fades.`}
            className="font-mono text-[10px] leading-none text-zinc-500"
          >
            vgd {fmt(vanguard, 0)}
          </span>
        ) : null}
      </div>

      <div className="mt-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
        {distance === null
          ? "—"
          : `${fmt(Math.abs(distance), 0)} pts ${support ? "below" : "above"}`}
        {distance !== null && spot > 0 ? (
          <span className="ml-1 opacity-70">
            {fmt((Math.abs(distance) / spot) * 100, 2)}%
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Memoized: identical props (the common case on a tick that changed nothing
 * upstream) means an identical wall read-out — skip the re-render. */
export const CoaMatrixPanel = memo(function CoaMatrixPanel({
  chain,
  aegisOi = [],
  zenithOi = [],
  marketPcr = null,
  aegisTrail,
  zenithTrail,
}: {
  chain: OptionChain | undefined;
  /** Session OI history for the contract defending each wall. */
  aegisOi?: OiPoint[];
  zenithOi?: OiPoint[];
  /** Cumulative all-strike PCR for this underlying, from the market-data API. */
  marketPcr?: number | null;
  /**
   * Each wall's path through the session, reconstructed from historical OI.
   * Given, it replaces the engine's own trail — which only ever covers the time
   * this tab has been open, and is empty out of hours.
   */
  aegisTrail?: number[];
  zenithTrail?: number[];
}) {
  // Levels derived from an empty ladder are not levels, they are placeholders.
  if (!chain?.rows.length) {
    return (
      <Card className="min-h-0">
        <CardHeader className="shrink-0">
          <CardTitle className="truncate">COA Matrix</CardTitle>
          <Skeleton className="h-2 w-20" />
        </CardHeader>
        <CardContent className="min-h-0 p-1.5">
          <SkeletonPanel label="Loading COA levels">
            <div className="grid shrink-0 grid-cols-2 gap-1.5">
              <Skeleton className="h-[52px]" />
              <Skeleton className="h-[52px]" />
            </div>
            <Skeleton className="h-[46px] shrink-0" />
            <Skeleton className="h-[40px] shrink-0" />
            <Skeleton className="h-[36px] shrink-0" />
            <Skeleton className="min-h-[28px] flex-1" />
            <Skeleton className="h-[30px] shrink-0" />
          </SkeletonPanel>
        </CardContent>
      </Card>
    );
  }

  const { levels } = chain;
  const { toSupport, toResistance, band, position } = coaMetrics(chain);
  const pressure = marketPressure(chain);
  const depth = wallDepth(chain);
  const bands = triggerBands(chain, DEFAULT_CONFIG.invalidationPct);
  const settled = wallMerged("aegis", levels) && wallMerged("zenith", levels);

  return (
    <Card className="min-h-0">
      <CardHeader className="shrink-0">
        <CardTitle className="truncate">COA Matrix</CardTitle>
        <span
          title={
            settled
              ? "Both walls stand on their cumulative Vanguard strike."
              : "At least one wall has been built away from its Vanguard by today's writers."
          }
          className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-zinc-600"
        >
          {settled ? "walls settled" : "walls rebuilt"}
        </span>
      </CardHeader>

      <CardContent className="dk-scroll flex min-h-0 flex-col gap-0.5 overflow-y-auto p-1">
        <div className="shrink-0 grid grid-cols-2 gap-1">
          <Wall
            side="aegis"
            vanguard={levels.aegis_0}
            live={levels.aegis_1}
            shift={levels.aegis_shift}
            distance={toSupport}
            spot={chain.spot}
          />
          <Wall
            side="zenith"
            vanguard={levels.zenith_0}
            live={levels.zenith_1}
            shift={levels.zenith_shift}
            distance={toResistance}
            spot={chain.spot}
          />
        </div>

        {/* How much OI actually stands at each wall */}
        <Section
          label="Wall Depth"
          hint="Open interest defending each wall. A level with thin or unwinding OI is a level about to break."
          right={
            <span className="font-mono text-[9px] text-zinc-500">
              {compact(depth.aegisOi)} · {compact(depth.zenithOi)}
            </span>
          }
        >
          <div
            className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-zinc-900"
            title={`Aegis holds ${compact(depth.aegisOi)} put OI; Zenith holds ${compact(depth.zenithOi)} call OI.`}
          >
            <span
              className="bg-emerald-500/60 transition-[width] duration-500"
              style={{ width: `${depth.aegisShare}%` }}
            />
            <span className="flex-1 bg-rose-500/60" />
          </div>
          <div className="mt-0.5 flex items-center justify-between font-mono text-[9px]">
            <span
              className={cn(
                depth.aegisBuild >= 0 ? "text-emerald-400/80" : "text-amber-400/80",
              )}
              title="Intraday OI change at the Aegis strike."
            >
              {signed(depth.aegisBuild / 1000, 1)}K{" "}
              {depth.aegisBuild >= 0 ? "building" : "unwinding"}
            </span>
            <span
              className={cn(
                depth.zenithBuild >= 0 ? "text-rose-400/80" : "text-amber-400/80",
              )}
              title="Intraday OI change at the Zenith strike."
            >
              {depth.zenithBuild >= 0 ? "building" : "unwinding"}{" "}
              {signed(depth.zenithBuild / 1000, 1)}K
            </span>
          </div>

          {/* The same two numbers as a curve — the shape is what says whether
              a wall is being held or quietly abandoned. */}
          <div className="mt-1 grid grid-cols-2 gap-1">
            <OiCurve side="aegis" series={aegisOi} strike={levels.aegis_1} />
            <OiCurve side="zenith" series={zenithOi} strike={levels.zenith_1} />
          </div>
        </Section>

        {/* The proximity bands the signal engine actually tests */}
        <Section
          label="Engage Bands"
          hint={`Protocol Alpha engages only within ${DEFAULT_CONFIG.invalidationPct}% of a wall. These are the live trigger zones.`}
          right={
            <span
              className={cn(
                "font-mono text-[9px] font-semibold uppercase tracking-wider",
                bands.aegis?.armed || bands.zenith?.armed
                  ? "text-quantum"
                  : "text-zinc-600",
              )}
            >
              {bands.aegis?.armed
                ? "at aegis"
                : bands.zenith?.armed
                  ? "at zenith"
                  : "mid-range"}
            </span>
          }
        >
          <div className="mt-1 grid grid-cols-2 gap-1">
            {(
              [
                ["aegis", bands.aegis] as const,
                ["zenith", bands.zenith] as const,
              ]
            ).map(([side, b]) => {
              const support = side === "aegis";
              return (
                <div
                  key={side}
                  className={cn(
                    "rounded border px-1.5 py-1 font-mono text-[9px]",
                    b?.armed
                      ? support
                        ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-200"
                        : "border-rose-400/60 bg-rose-500/10 text-rose-200"
                      : "border-zinc-800 text-zinc-500",
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="uppercase tracking-wider">
                      {support ? "Aegis" : "Zenith"}
                    </span>
                    <span
                      className={cn(
                        "h-1 w-1 rounded-full",
                        b?.armed
                          ? support
                            ? "bg-emerald-400 animate-pulse-ring"
                            : "bg-rose-400 animate-pulse-ring"
                          : "bg-zinc-700",
                      )}
                    />
                  </div>
                  <div className="mt-1 truncate">
                    {b ? `${fmt(b.lo, 0)}–${fmt(b.hi, 0)}` : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        {/* Where the session's writing is going */}
        <Section
          label="Writing Pressure"
          hint="Puts written below spot versus calls written above. The wider side is where writers are taking their stand — it moves well before price does."
          right={
            <span
              className={cn(
                "font-mono text-[9px] font-semibold uppercase tracking-wider",
                pressure.direction > 0
                  ? "text-emerald-300"
                  : pressure.direction < 0
                    ? "text-rose-300"
                    : "text-zinc-500",
              )}
            >
              {pressure.label}
            </span>
          }
        >
          <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-zinc-900">
            <span
              className="bg-emerald-500/70 transition-[width] duration-500"
              style={{ width: `${pressure.supportShare}%` }}
            />
            <span className="flex-1 bg-rose-500/70" />
          </div>
          <div className="mt-0.5 flex items-center justify-between font-mono text-[9px] text-zinc-500">
            <span className="text-emerald-400/80">
              {compact(pressure.supportBuild)} puts ↓
            </span>
            <span className="text-rose-400/80">
              ↑ {compact(pressure.resistanceBuild)} calls
            </span>
          </div>
        </Section>

        {/* Where the walls have actually stood this session */}
        <WallMigration
          aegis={aegisTrail ?? levels.aegis_trail}
          zenith={zenithTrail ?? levels.zenith_trail}
          spot={chain.spot}
          historical={!!aegisTrail}
        />

        {/* Corridor geometry */}
        <div className="shrink-0 grid grid-cols-3 gap-2 rounded-md border border-zinc-800 bg-zinc-950/50 px-2 py-1">
          {(
            [
              {
                label: "Corridor",
                title:
                  "Distance between Aegis and Zenith — the range the engine expects to trade inside.",
                value: band === null ? "—" : fmt(band, 0),
                sub:
                  band !== null && chain.spot > 0
                    ? `${fmt((band / chain.spot) * 100, 2)}%`
                    : undefined,
                tone: "text-zinc-100",
              },
              {
                label: "Position",
                title:
                  "Where spot sits inside the corridor: 0% on Aegis, 100% on Zenith.",
                value: position === null ? "—" : `${fmt(position, 0)}%`,
                tone: "text-quantum",
              },
              {
                label: "PCR",
                title:
                  marketPcr === null
                    ? "Put-Call OI ratio across the rendered window. Above 1 is put-heavy, which is supportive."
                    : `Put-Call OI ratio across the rendered window: ${fmt(chain.pcr)}. Cumulative across every strike, from the market-data API: ${fmt(marketPcr)}. Above 1 is put-heavy, which is supportive; a window far from the cumulative reading means the weight sits outside the strikes drawn here.`,
                value: fmt(chain.pcr),
                sub: marketPcr === null ? undefined : `all ${fmt(marketPcr)}`,
                tone: chain.pcr >= 1 ? "text-emerald-300" : "text-rose-300",
              },
            ] as const
          ).map((s) => (
            <div key={s.label} title={s.title} className="min-w-0">
              <div className="dk-label text-[9px] leading-none">{s.label}</div>
              <div
                className={cn(
                  "mt-1 truncate font-mono text-[12px] font-semibold leading-none",
                  s.tone,
                )}
              >
                {s.value}
                {"sub" in s && s.sub ? (
                  <span className="ml-1 text-[9px] font-normal opacity-60">
                    {s.sub}
                  </span>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});
