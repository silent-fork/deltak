"use client";

import { memo, useMemo } from "react";

import { QuadrantPill } from "@/components/QuadrantPill";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton, SkeletonPanel } from "@/components/ui/skeleton";
import { wallTags, type WallTag } from "@/lib/coaView";
import type { OptionChain, OptionLeg } from "@/lib/types";
import { cn, compact, fmt } from "@/lib/utils";

/** Tag styling: colour carries the wall, weight carries the generation. */
function tagClass(tag: WallTag): string {
  const support = tag.side === "aegis";
  if (tag.generation === "vanguard") {
    return support
      ? "border-emerald-500/35 text-emerald-400/80"
      : "border-rose-500/35 text-rose-400/80";
  }
  return support
    ? "border-emerald-400/70 bg-emerald-400/20 text-emerald-200"
    : "border-rose-400/70 bg-rose-400/20 text-rose-200";
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
        {Array.from({ length: 6 }, (_, i) => (
          <td key={i} className="px-1.5 py-1 text-zinc-700">
            —
          </td>
        ))}
      </>
    );
  }

  const oiPct = maxOi > 0 ? Math.min(100, (leg.oi / maxOi) * 100) : 0;
  const itm = leg.moneyness === "ITM";
  const spread =
    leg.best_ask > 0 && leg.best_bid > 0 ? leg.best_ask - leg.best_bid : null;

  const cells = [
    <td key="rrg" className="px-1.5 py-1">
      <QuadrantPill quadrant={leg.quadrant} compact />
    </td>,

    <td
      key="rs"
      className="px-1.5 py-1 font-mono text-[9px] text-zinc-600"
      title={
        leg.rs_ratio !== null
          ? `RS-Ratio ${fmt(leg.rs_ratio)} · RS-Momentum ${fmt(leg.rs_momentum)}`
          : "RRG node not yet seeded"
      }
    >
      {leg.rs_ratio !== null ? fmt(leg.rs_ratio, 1) : "—"}
    </td>,

    <td key="vol" className="px-1.5 py-1 font-mono text-[10px] text-zinc-500">
      {leg.volume > 0 ? compact(leg.volume) : "—"}
    </td>,

    <td key="oi" className="relative px-1.5 py-1">
      {/* OI depth bar — the wall itself, rendered behind the number */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0.5 opacity-25",
          side === "call" ? "right-0 rounded-l bg-rose-500" : "left-0 rounded-r bg-emerald-500",
        )}
        style={{ width: `${oiPct}%` }}
      />
      <span className="relative font-mono text-[10px] text-zinc-400">
        {leg.oi > 0 ? compact(leg.oi) : "—"}
      </span>
    </td>,

    <td
      key="ba"
      className="px-1.5 py-1 font-mono text-[9.5px] tabular-nums"
      title={
        spread !== null
          ? `Bid ${fmt(leg.best_bid)} / Ask ${fmt(leg.best_ask)} — spread ${fmt(spread)}`
          : "No two-sided quote"
      }
    >
      {/* Bid and ask read as two distinct numbers, not one string — a seller's
          price tinted toward the calls/puts colour of that side's floor, a
          buyer's price toward its ceiling, with the slash between them doing
          the separating instead of a cramped, same-colour middle dot. */}
      {leg.best_bid > 0 ? (
        <span className="whitespace-nowrap">
          <span className="text-emerald-500/70">{fmt(leg.best_bid, 1)}</span>
          <span className="mx-0.5 text-zinc-700">/</span>
          <span className="text-rose-500/70">{fmt(leg.best_ask, 1)}</span>
        </span>
      ) : (
        <span className="text-zinc-700">—</span>
      )}
    </td>,

    <td
      key="ltp"
      className="px-1.5 py-1"
      title={`${leg.trading_symbol} · ${leg.moneyness}${leg.itm_depth > 0 ? ` depth ${leg.itm_depth}` : ""}`}
    >
      {/* A contract that has not traded has no price. Quoting 0.00 for it
          reads as "worthless", which is a very different claim. */}
      {leg.ltp > 0 ? (
        <span className="flex items-baseline justify-end gap-1 whitespace-nowrap">
          <span
            className={cn(
              "font-mono text-[13px] font-bold tabular-nums",
              itm ? "text-zinc-100" : "text-zinc-400",
            )}
          >
            {fmt(leg.ltp)}
          </span>
          {leg.change_pct !== 0 ? (
            <span
              className={cn(
                "inline-flex shrink-0 items-center rounded-sm px-1 py-px font-mono text-[8px] font-semibold leading-none tabular-nums",
                leg.change_pct >= 0
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-rose-500/15 text-rose-400",
              )}
            >
              {leg.change_pct >= 0 ? "▲" : "▼"}
              {fmt(Math.abs(leg.change_pct), 1)}%
            </span>
          ) : (
            <span className="inline-flex shrink-0 items-center rounded-sm bg-zinc-800/50 px-1 py-px font-mono text-[8px] font-semibold leading-none tabular-nums text-zinc-600">
              flat
            </span>
          )}
        </span>
      ) : (
        <span className="font-mono text-xs text-zinc-700">—</span>
      )}
    </td>,
  ];

  // Calls read outward-in from the left, puts inward-out to the right.
  return <>{side === "call" ? cells.reverse() : cells}</>;
}

/**
 * Sticky header cells.
 *
 * `h-*` on a `<th>` is a minimum, so the offsets below are exact only because
 * both rows are pinned to the same height as the text they hold.
 */
const BAND_TH =
  "sticky top-0 z-20 h-[19px] bg-zinc-900 px-1.5 py-0.5 font-medium";
const COL_TH =
  "sticky top-[19px] z-20 h-[19px] bg-zinc-900 px-1.5 py-0.5 font-medium shadow-[0_1px_0_rgb(39,39,42)]";

const HEAD = ["RRG", "RS", "Vol", "OI", "Bid·Ask", "LTP"] as const;

const HEAD_TITLE: Record<string, string> = {
  RRG: "Relative-rotation quadrant for this contract.",
  RS: "RS-Ratio — relative strength against the index.",
  Vol: "Session volume.",
  OI: "Cumulative open interest.",
  "Bid·Ask": "Best bid and ask.",
  LTP: "Last traded premium and its change on the day.",
};

/**
 * Memoized: this renders a ~25-strike × 2-leg table (six cells a leg) and
 * re-mapping it is real work. `chain` is a fresh object only when the engine
 * actually rebuilt it — the 1 Hz loop skips both the rebuild and the
 * snapshot paint on a tick that changed nothing — so a shallow-equal `chain`
 * (and `signalToken`) reliably means there is nothing new to draw.
 */
export const OptionChainMatrix = memo(function OptionChainMatrix({
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

  // An empty ladder is still loading: the master or the feed has not landed.
  if (!chain?.rows.length) {
    return (
      <Card className="h-full min-h-0">
        <CardHeader className="shrink-0">
          <CardTitle className="truncate">4-Quadrant Option Chain</CardTitle>
          <Skeleton className="h-2 w-28" />
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-hidden p-2">
          <SkeletonPanel label="Loading the option chain">
            <Skeleton className="h-[19px] shrink-0" />
            {/* A ladder of strikes, each with a wider strike column in the
                middle — the shape the rows will actually take. */}
            {Array.from({ length: 14 }, (_, i) => (
              <div key={i} className="flex shrink-0 items-center gap-1">
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 flex-1" />
              </div>
            ))}
          </SkeletonPanel>
        </CardContent>
      </Card>
    );
  }

  const { levels } = chain;

  // Only the walls tint a row. The horizon is drawn as a line and nothing else:
  // a band across the middle of the ladder competes with the OI bars it sits on,
  // and the ATM strike already reads as cyan in the strike column.
  const rowTone = (tags: WallTag[]) => {
    if (tags.some((t) => t.side === "aegis")) return "bg-emerald-500/[0.06]";
    if (tags.length) return "bg-rose-500/[0.06]";
    return "";
  };

  return (
    <Card className="h-full min-h-0">
      <CardHeader className="shrink-0">
        <div className="flex min-w-0 items-center gap-2">
          <CardTitle className="truncate">4-Quadrant Option Chain</CardTitle>
          <Badge className="shrink-0 border-zinc-700 text-zinc-400">
            {chain.label} · {chain.expiry ?? "—"}
          </Badge>
        </div>
        <span className="shrink-0 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
          {chain.rows.length} strikes · PCR {fmt(chain.pcr)}
        </span>
      </CardHeader>

      <CardContent className="dk-scroll min-h-0 flex-1 overflow-auto p-0">
        <table className="w-full border-collapse text-right">
          {/*
            Both header rows stick, and they stick per-cell rather than as a
            `<thead>`: a translucent header over a scrolling ladder let the rows
            underneath print straight through the labels. So each cell carries
            its own opaque fill, the second row is offset by the first row's
            fixed height, and the pair casts one shadow to separate itself from
            the strikes moving under it.
          */}
          <thead>
            <tr className="text-[9px] uppercase tracking-wider text-zinc-500">
              <th
                colSpan={6}
                className={cn(BAND_TH, "text-center text-emerald-500/80")}
              >
                Calls
              </th>
              <th className={cn(BAND_TH, "text-center text-quantum/80")}>Strike</th>
              <th colSpan={6} className={cn(BAND_TH, "text-center text-rose-500/80")}>
                Puts
              </th>
            </tr>
            <tr className="text-[9px] uppercase tracking-wider text-zinc-600">
              {[...HEAD].reverse().map((h) => (
                <th key={`c-${h}`} className={COL_TH} title={HEAD_TITLE[h]}>
                  {h}
                </th>
              ))}
              <th className={cn(COL_TH, "text-center")}>—</th>
              {HEAD.map((h) => (
                <th key={`p-${h}`} className={COL_TH} title={HEAD_TITLE[h]}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {chain.rows.map((row) => {
              const tags = wallTags(row.strike, levels);
              const highlighted =
                signalToken &&
                (row.call?.token === signalToken || row.put?.token === signalToken);
              return (
                <tr
                  key={row.strike}
                  className={cn(
                    "border-b border-zinc-800/40 transition-colors hover:bg-zinc-800/40",
                    rowTone(tags),
                    row.quantum_horizon && "dk-quantum-horizon",
                    highlighted && "shadow-[inset_0_0_0_1px_rgba(0,240,255,0.5)]",
                  )}
                >
                  <LegCells leg={row.call} side="call" maxOi={maxOi} />
                  <td
                    className={cn(
                      "whitespace-nowrap border-x border-zinc-800/60 px-2 py-1 text-center font-mono text-[11px] font-bold",
                      row.is_atm ? "text-quantum text-glow-quantum" : "text-zinc-300",
                    )}
                  >
                    <span className="flex items-center justify-center gap-1">
                      {fmt(row.strike, 0)}
                      {tags.map((t) => (
                        <span
                          key={t.key}
                          title={t.title}
                          className={cn(
                            "rounded border px-1 text-[8px] font-bold leading-[1.4] tracking-tight",
                            tagClass(t),
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
          <span className="rounded border border-emerald-400/70 bg-emerald-400/20 px-1 text-[8px] font-bold text-emerald-200">
            Aegis
          </span>
          <span className="rounded border border-rose-400/70 bg-rose-400/20 px-1 text-[8px] font-bold text-rose-200">
            Zenith
          </span>
          <span
            title="Vanguard — the cumulative open-interest wall, standing ahead of the live one. Shown only when today's writing has built the wall on a different strike."
            className="rounded border border-zinc-600/60 px-1 text-[8px] font-bold text-zinc-400"
          >
            Vanguard
          </span>
        </span>
        <span>Zero-OTM rule: longs restricted to 2nd–3rd ITM</span>
      </div>
    </Card>
  );
});
