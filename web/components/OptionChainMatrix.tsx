"use client";

import { useMemo } from "react";

import { CoaStrip } from "@/components/CoaStrip";
import { QuadrantPill } from "@/components/QuadrantPill";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChainRow, CoaLevels, OptionChain, OptionLeg } from "@/lib/types";
import { cn, compact, fmt, signed } from "@/lib/utils";

/** OI-change bar: green = writers adding (a wall building), red = unwinding. */
function OiChangeCell({ leg }: { leg: OptionLeg | null }) {
  if (!leg) return <td className="px-1.5 py-1 text-zinc-700">—</td>;
  const positive = leg.oi_change >= 0;
  return (
    <td className="px-1.5 py-1">
      <span
        className={cn(
          "font-mono text-[10px]",
          leg.oi_change === 0
            ? "text-zinc-600"
            : positive
              ? "text-emerald-400"
              : "text-rose-400",
        )}
      >
        {leg.oi_change === 0 ? "—" : signed(leg.oi_change / 1000, 1) + "K"}
      </span>
    </td>
  );
}

function LegCells({
  leg,
  side,
  maxOi,
}: {
  leg: OptionLeg | null;
  side: "call" | "put";
  maxOi: number;
}) {
  if (!leg) {
    return (
      <>
        <td className="px-1.5 py-1 text-zinc-700">—</td>
        <td className="px-1.5 py-1 text-zinc-700">—</td>
        <td className="px-1.5 py-1 text-zinc-700">—</td>
        <td className="px-1.5 py-1 text-zinc-700">—</td>
        <td className="px-1.5 py-1 text-zinc-700">—</td>
      </>
    );
  }

  const oiPct = maxOi > 0 ? Math.min(100, (leg.oi / maxOi) * 100) : 0;
  const itm = leg.moneyness === "ITM";

  const cells = [
    <td key="q" className="px-1.5 py-1">
      <QuadrantPill quadrant={leg.quadrant} compact />
    </td>,
    <td key="v" className="px-1.5 py-1 font-mono text-[10px] text-zinc-500">
      {compact(leg.volume)}
    </td>,
    <OiChangeCell key="oic" leg={leg} />,
    <td key="oi" className="relative px-1.5 py-1">
      {/* OI depth bar — the COA 1.0 wall, rendered behind the number */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0.5 opacity-25",
          side === "call"
            ? "right-0 rounded-l bg-rose-500"
            : "left-0 rounded-r bg-emerald-500",
        )}
        style={{ width: `${oiPct}%` }}
      />
      <span className="relative font-mono text-[10px] text-zinc-400">
        {compact(leg.oi)}
      </span>
    </td>,
    <td
      key="ltp"
      className={cn(
        "px-1.5 py-1 font-mono text-xs font-semibold",
        itm ? "text-zinc-100" : "text-zinc-400",
      )}
      title={`${leg.trading_symbol} · bid ${fmt(leg.best_bid)} / ask ${fmt(leg.best_ask)}`}
    >
      {fmt(leg.ltp)}
      <span
        className={cn(
          "ml-1 text-[9px] font-normal",
          leg.change_pct >= 0 ? "text-emerald-500" : "text-rose-500",
        )}
      >
        {signed(leg.change_pct, 1)}%
      </span>
    </td>,
  ];

  // Calls read outward-in from the left, puts inward-out to the right.
  return <>{side === "call" ? cells.reverse() : cells}</>;
}

/* ----------------------------------------------------------------- COA tags */

type LevelTag = {
  key: string;
  label: string;
  title: string;
  cls: string;
  support: boolean;
};

/**
 * Both generations of each wall are marked, because they disagree often and the
 * disagreement is the signal: A0/Z0 are the cumulative walls carried into the
 * session, A1/Z1 where today's writers have actually moved them.
 */
function levelTags(strike: number, levels: CoaLevels): LevelTag[] {
  const at = (level: number | null) => level !== null && strike === level;
  const tags: LevelTag[] = [];

  if (at(levels.aegis_0))
    tags.push({
      key: "a0",
      label: "A0",
      support: true,
      title: "Aegis-0 — cumulative put-OI wall (COA 1.0 support).",
      cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400/90",
    });
  if (at(levels.aegis_1))
    tags.push({
      key: "a1",
      label: "A1",
      support: true,
      title: "Aegis-1 — live intraday put-write wall (COA 2.0 support).",
      cls: "border-emerald-400/70 bg-emerald-400/20 text-emerald-200",
    });
  if (at(levels.zenith_0))
    tags.push({
      key: "z0",
      label: "Z0",
      support: false,
      title: "Zenith-0 — cumulative call-OI wall (COA 1.0 resistance).",
      cls: "border-rose-500/40 bg-rose-500/10 text-rose-400/90",
    });
  if (at(levels.zenith_1))
    tags.push({
      key: "z1",
      label: "Z1",
      support: false,
      title: "Zenith-1 — live intraday call-write wall (COA 2.0 resistance).",
      cls: "border-rose-400/70 bg-rose-400/20 text-rose-200",
    });

  return tags;
}

export function OptionChainMatrix({
  chain,
  signalToken,
}: {
  chain: OptionChain | undefined;
  signalToken?: string | null;
}) {
  const maxOi = useMemo(() => {
    if (!chain) return 0;
    return chain.rows.reduce(
      (max, r) => Math.max(max, r.call?.oi ?? 0, r.put?.oi ?? 0),
      0,
    );
  }, [chain]);

  if (!chain) {
    return (
      <Card className="h-full min-h-0">
        <CardContent className="flex items-center justify-center text-xs text-zinc-600">
          Awaiting option chain…
        </CardContent>
      </Card>
    );
  }

  const { levels } = chain;

  // A wall and the ATM anchor regularly land on the same strike; the wall tint
  // wins and the ATM keeps its own ring, so neither reading is lost.
  const rowTone = (tags: LevelTag[], row: ChainRow) => {
    if (tags.some((t) => t.support)) return "bg-emerald-500/[0.06]";
    if (tags.length) return "bg-rose-500/[0.06]";
    if (row.is_atm) return "bg-quantum/[0.07]";
    return "";
  };

  return (
    <Card className="h-full min-h-0">
      <CardHeader className="shrink-0">
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle className="truncate">Delta-K 4-Quadrant Matrix</CardTitle>
          <Badge className="shrink-0 border-zinc-700 text-zinc-400">
            {chain.label} · {chain.expiry ?? "—"}
          </Badge>
        </div>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          {chain.rows.length} strikes
        </span>
      </CardHeader>

      {/* COA levels, distances and corridor position — the prose replaced */}
      <div className="shrink-0">
        <CoaStrip chain={chain} />
      </div>

      <CardContent className="dk-scroll min-h-0 flex-1 overflow-auto p-0">
        <table className="w-full border-collapse text-right">
          <thead className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur">
            <tr className="text-[9px] uppercase tracking-wider text-zinc-500">
              <th
                colSpan={5}
                className="border-b border-zinc-800 px-1.5 py-1 text-center text-emerald-500/80"
              >
                Calls
              </th>
              <th className="border-b border-zinc-800 px-1.5 py-1 text-center text-quantum/80">
                Strike
              </th>
              <th
                colSpan={5}
                className="border-b border-zinc-800 px-1.5 py-1 text-center text-rose-500/80"
              >
                Puts
              </th>
            </tr>
            <tr className="text-[9px] uppercase tracking-wider text-zinc-600">
              <th className="px-1.5 py-1 font-medium">LTP</th>
              <th className="px-1.5 py-1 font-medium">OI</th>
              <th className="px-1.5 py-1 font-medium" title="COA 2.0 intraday OI change">
                ΔOI
              </th>
              <th className="px-1.5 py-1 font-medium">Vol</th>
              <th className="px-1.5 py-1 font-medium">RRG</th>
              <th className="px-1.5 py-1 text-center font-medium">—</th>
              <th className="px-1.5 py-1 font-medium">RRG</th>
              <th className="px-1.5 py-1 font-medium">Vol</th>
              <th className="px-1.5 py-1 font-medium" title="COA 2.0 intraday OI change">
                ΔOI
              </th>
              <th className="px-1.5 py-1 font-medium">OI</th>
              <th className="px-1.5 py-1 font-medium">LTP</th>
            </tr>
          </thead>
          <tbody>
            {chain.rows.map((row) => {
              const tags = levelTags(row.strike, levels);
              const highlighted =
                signalToken &&
                (row.call?.token === signalToken || row.put?.token === signalToken);
              return (
                <tr
                  key={row.strike}
                  className={cn(
                    "border-b border-zinc-800/40 transition-colors hover:bg-zinc-800/40",
                    rowTone(tags, row),
                    row.quantum_horizon && "dk-quantum-horizon",
                    highlighted && "shadow-[inset_0_0_0_1px_rgba(0,240,255,0.5)]",
                  )}
                >
                  <LegCells leg={row.call} side="call" maxOi={maxOi} />
                  <td
                    className={cn(
                      "border-x border-zinc-800/60 px-2 py-1 text-center font-mono text-[11px] font-bold",
                      row.is_atm ? "text-quantum text-glow-quantum" : "text-zinc-300",
                    )}
                  >
                    <span className="flex items-center justify-center gap-1 whitespace-nowrap">
                      {fmt(row.strike, 0)}
                      {tags.map((t) => (
                        <span
                          key={t.key}
                          title={t.title}
                          className={cn(
                            "rounded border px-0.5 text-[8px] font-bold leading-[1.35] tracking-tight",
                            t.cls,
                          )}
                        >
                          {t.label}
                        </span>
                      ))}
                    </span>
                  </td>
                  <LegCells leg={row.put} side="put" maxOi={maxOi} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>

      {/* Pinned legend — stays put while the matrix scrolls under it */}
      <div className="shrink-0 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-zinc-800 px-3 py-1.5 text-[9px] uppercase tracking-wider text-zinc-600">
        <span className="flex items-center gap-1.5">
          <span className="h-px w-6 bg-quantum shadow-[0_0_6px_#00f0ff]" />
          Quantum Horizon — ITM / OTM split at spot
        </span>
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1">
            <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-0.5 text-[8px] font-bold text-emerald-400/90">
              A0
            </span>
            <span className="rounded border border-emerald-400/70 bg-emerald-400/20 px-0.5 text-[8px] font-bold text-emerald-200">
              A1
            </span>
            support
          </span>
          <span className="flex items-center gap-1">
            <span className="rounded border border-rose-500/40 bg-rose-500/10 px-0.5 text-[8px] font-bold text-rose-400/90">
              Z0
            </span>
            <span className="rounded border border-rose-400/70 bg-rose-400/20 px-0.5 text-[8px] font-bold text-rose-200">
              Z1
            </span>
            resistance
          </span>
        </span>
        <span>Zero-OTM rule: longs restricted to 2nd–3rd ITM</span>
      </div>
    </Card>
  );
}
