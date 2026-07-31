"use client";

import { Shield, TrendingUp } from "lucide-react";
import { useMemo } from "react";

import { QuadrantPill } from "@/components/QuadrantPill";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ChainRow, OptionChain, OptionLeg } from "@/lib/types";
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
      <Card className="h-full">
        <CardContent className="flex items-center justify-center text-xs text-zinc-600">
          Awaiting option chain…
        </CardContent>
      </Card>
    );
  }

  const { levels } = chain;

  const rowTone = (row: ChainRow) => {
    if (row.is_atm) return "bg-quantum/[0.07]";
    if (levels.aegis_1 !== null && row.strike === levels.aegis_1)
      return "bg-emerald-500/[0.07]";
    if (levels.zenith_1 !== null && row.strike === levels.zenith_1)
      return "bg-rose-500/[0.07]";
    return "";
  };

  return (
    <Card className="h-full min-h-0">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Delta-K 4-Quadrant Matrix</CardTitle>
          <Badge className="border-zinc-700 text-zinc-400">
            {chain.label} · {chain.expiry ?? "—"}
          </Badge>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
            title="COA 2.0 support — the strike accumulating the most intraday put OI."
          >
            <Shield className="h-3 w-3" />
            Aegis-1 {levels.aegis_1 !== null ? fmt(levels.aegis_1, 0) : "—"}
            {levels.aegis_shift !== 0 ? (
              <span className="opacity-70">
                {" "}
                {signed(levels.aegis_shift, 0)}
              </span>
            ) : null}
          </Badge>
          <Badge
            className="border-rose-500/40 bg-rose-500/10 text-rose-300"
            title="COA 2.0 resistance — the strike accumulating the most intraday call OI."
          >
            <TrendingUp className="h-3 w-3" />
            Zenith-1 {levels.zenith_1 !== null ? fmt(levels.zenith_1, 0) : "—"}
            {levels.zenith_shift !== 0 ? (
              <span className="opacity-70">
                {" "}
                {signed(levels.zenith_shift, 0)}
              </span>
            ) : null}
          </Badge>
          <Badge className="border-zinc-700 text-zinc-400" title="Put-Call OI ratio">
            PCR {fmt(chain.pcr)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="overflow-auto p-0">
        <table className="w-full border-collapse text-right">
          <thead className="sticky top-0 z-10 bg-zinc-900/95 backdrop-blur">
            <tr className="text-[9px] uppercase tracking-wider text-zinc-500">
              <th colSpan={5} className="border-b border-zinc-800 px-1.5 py-1 text-center text-emerald-500/80">
                Calls
              </th>
              <th className="border-b border-zinc-800 px-1.5 py-1 text-center text-quantum/80">
                Strike
              </th>
              <th colSpan={5} className="border-b border-zinc-800 px-1.5 py-1 text-center text-rose-500/80">
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
              const highlighted =
                signalToken &&
                (row.call?.token === signalToken || row.put?.token === signalToken);
              return (
                <tr
                  key={row.strike}
                  className={cn(
                    "border-b border-zinc-800/40 transition-colors hover:bg-zinc-800/40",
                    rowTone(row),
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
                    {fmt(row.strike, 0)}
                  </td>
                  <LegCells leg={row.put} side="put" maxOi={maxOi} />
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 px-3 py-1.5 text-[9px] uppercase tracking-wider text-zinc-600">
          <span className="flex items-center gap-1.5">
            <span className="h-px w-6 bg-quantum shadow-[0_0_6px_#00f0ff]" />
            Quantum Horizon — ITM / OTM split at spot
          </span>
          <span>Zero-OTM rule: longs restricted to 2nd–3rd ITM</span>
        </div>
      </CardContent>
    </Card>
  );
}
