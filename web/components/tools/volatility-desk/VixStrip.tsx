"use client";

import { ArrowDown, ArrowUp, TriangleAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, fmt } from "@/lib/utils";
import type {
  IndexOptionMetrics,
  OiBuildupStock,
  VixReading,
  VixRegime,
} from "@/lib/tools/volatilityDeskTypes";

/** Same 1.3 / 0.7 split `PcrDial` draws its bullish/bearish arcs at. */
function pcrLean(pcr: number): "bullish" | "bearish" | "balanced" {
  if (pcr >= 1.3) return "bullish";
  if (pcr <= 0.7) return "bearish";
  return "balanced";
}

const LEAN_COLOR: Record<"bullish" | "bearish" | "balanced", string> = {
  bullish: "#10b981",
  bearish: "#f43f5e",
  balanced: "#a1a1aa",
};

/**
 * The three reads this whole dashboard already computes, stated as one
 * sentence rather than a proprietary score — OI breadth and PCR are both
 * already on screen elsewhere on this page, this just says what they add
 * up to instead of leaving that inference to the visitor.
 */
function describeBreadth(
  bullishPct: number,
  indices: IndexOptionMetrics[],
  vix: VixReading,
): { label: string; tone: "bullish" | "bearish" | "balanced"; text: string } {
  const oiLean = bullishPct > 0.55 ? "bullish" : bullishPct < 0.45 ? "bearish" : "balanced";
  const leans = indices.map((ix) => pcrLean(ix.pcr));
  const pcrBullish = leans.filter((l) => l === "bullish").length;
  const pcrBearish = leans.filter((l) => l === "bearish").length;
  const pcrOverall = pcrBullish > pcrBearish ? "bullish" : pcrBearish > pcrBullish ? "bearish" : "balanced";
  const hostileVix = vix.regime === "Elevated" || vix.regime === "Panic";

  if (hostileVix) {
    return {
      label: "Risk-Off",
      tone: "bearish",
      text: `VIX is ${vix.regime.toLowerCase()} — that alone outweighs the OI and PCR reads below.`,
    };
  }
  if (oiLean === "bullish" && pcrOverall !== "bearish") {
    return {
      label: "Risk-On",
      tone: "bullish",
      text: "OI flow and PCR both lean bullish while VIX stays calm.",
    };
  }
  if (oiLean === "bearish" && pcrOverall !== "bullish") {
    return {
      label: "Risk-Off",
      tone: "bearish",
      text: "OI flow and PCR both lean bearish even with VIX calm.",
    };
  }
  return {
    label: "Mixed",
    tone: "balanced",
    text: "OI flow and PCR aren't pointing the same way — no clear breadth lean right now.",
  };
}

const REGIME_POSITION: Record<VixRegime, number> = {
  Calm: 0.15,
  Normal: 0.42,
  Elevated: 0.68,
  Panic: 0.9,
};

const REGIME_COLOR: Record<VixRegime, string> = {
  Calm: "#10b981",
  Normal: "#eab308",
  Elevated: "#f97316",
  Panic: "#f43f5e",
};

export function VixStrip({
  vix,
  oiBuildup,
  indices,
}: {
  vix: VixReading | null;
  oiBuildup: OiBuildupStock[];
  indices: IndexOptionMetrics[];
}) {
  if (!vix) {
    return (
      <Card className="min-h-0">
        <CardHeader>
          <CardTitle>India VIX</CardTitle>
        </CardHeader>
        <CardContent className="flex min-h-[120px] items-center justify-center">
          <p className="font-mono text-[10px] text-zinc-600">VIX data unavailable right now.</p>
        </CardContent>
      </Card>
    );
  }

  const hostile = vix.regime === "Elevated" || vix.regime === "Panic";

  const bullishCount = oiBuildup.filter(
    (s) => s.quadrant === "LONG_BUILDUP" || s.quadrant === "SHORT_COVERING",
  ).length;
  const bearishCount = oiBuildup.filter(
    (s) => s.quadrant === "SHORT_BUILDUP" || s.quadrant === "LONG_UNWINDING",
  ).length;
  const oiTotal = oiBuildup.length;
  const bullishPct = oiTotal > 0 ? bullishCount / oiTotal : 0.5;
  const breadth = oiTotal > 0 && indices.length > 0 ? describeBreadth(bullishPct, indices, vix) : null;

  return (
    <Card className="min-h-0">
      <CardHeader>
        <CardTitle>India VIX</CardTitle>
        <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">Regime</span>
      </CardHeader>
      <CardContent className="dk-scroll overflow-y-auto p-2">
        <div className="mb-2.5 flex items-baseline gap-2 px-1">
          <span className="font-mono text-xl font-bold" style={{ color: REGIME_COLOR[vix.regime] }}>
            {fmt(vix.value)}
          </span>
          <span className="font-mono text-[11px] text-zinc-400">{vix.regime}</span>
          <span
            className={cn(
              "ml-auto font-mono text-[10px] tabular-nums",
              vix.changePct >= 0 ? "text-rose-400" : "text-emerald-400",
            )}
          >
            {vix.changePct >= 0 ? "+" : ""}
            {fmt(vix.changePct)}%
          </span>
        </div>

        <div className="relative h-2.5 overflow-hidden rounded-full">
          <div
            className="h-full w-full"
            style={{
              background:
                "linear-gradient(90deg,#10b981 0%,#10b981 30%,#eab308 30%,#eab308 55%,#f97316 55%,#f97316 78%,#f43f5e 78%,#f43f5e 100%)",
            }}
          />
          <div
            className="absolute -top-1 h-[18px] w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]"
            style={{ left: `${REGIME_POSITION[vix.regime] * 100}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between font-mono text-[8.5px] uppercase tracking-wider text-zinc-600">
          <span>Calm</span>
          <span>Normal</span>
          <span>Elevated</span>
          <span>Panic</span>
        </div>

        {hostile ? (
          <div className="mt-3 flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/[0.06] px-2.5 py-2">
            <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
            <p className="text-[11px] leading-snug text-zinc-400">
              VIX is <span className="font-semibold text-amber-400">{vix.regime}</span> — the same
              volatility-trap band DKMS&apos;s own{" "}
              <span className="font-semibold text-amber-400">Protocol Delta</span> mutes the terminal&apos;s
              auto-driver for.
            </p>
          </div>
        ) : null}

        {/* Everything below is already on this page — OI Buildup Compass's own
            counts, PCR's own thresholds — restated as one read instead of
            leaving the visitor to add three panels up themselves. Not a
            score: every number here traces back to a panel elsewhere on
            this dashboard. */}
        {breadth ? (
          <div className="mt-4 border-t border-zinc-800/70 pt-3">
            <div className="flex items-center justify-between px-1">
              <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                Market breadth
              </span>
              <span
                className="rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider"
                style={{
                  color: LEAN_COLOR[breadth.tone],
                  borderColor: `${LEAN_COLOR[breadth.tone]}4d`,
                  backgroundColor: `${LEAN_COLOR[breadth.tone]}1a`,
                }}
              >
                {breadth.label}
              </span>
            </div>

            <div className="mt-2.5 px-1">
              <div className="flex items-center justify-between font-mono text-[9px] text-zinc-500">
                <span>
                  <span className="font-semibold text-emerald-400">{bullishCount}</span> bullish OI
                </span>
                <span>
                  <span className="font-semibold text-rose-400">{bearishCount}</span> bearish OI
                </span>
              </div>
              <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full bg-emerald-500/70" style={{ width: `${bullishPct * 100}%` }} />
                <div
                  className="h-full bg-rose-500/70"
                  style={{ width: `${100 - bullishPct * 100}%` }}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5 px-1">
              {indices.map((ix) => {
                const lean = pcrLean(ix.pcr);
                return (
                  <span
                    key={ix.underlying}
                    className="rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[9px] tabular-nums"
                    style={{ color: LEAN_COLOR[lean] }}
                  >
                    {ix.label} PCR {fmt(ix.pcr)}
                  </span>
                );
              })}
            </div>

            <p className="mt-3 px-1 text-[11px] leading-relaxed text-zinc-500">{breadth.text}</p>

            {/* Max Pain Skyline already plots this per index below — restated
                here as a distance rather than a direction on purpose: the
                glossary's own Max Pain entry is explicit that the theory's
                predictive record is mixed at best, so this reads as "how far,"
                not "which way it's being pulled." */}
            <div className="mt-3 border-t border-zinc-800/70 pt-3">
              <span className="px-1 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                Spot vs Max Pain
              </span>
              <div className="mt-2 flex flex-col gap-1.5 px-1">
                {indices.map((ix) => {
                  if (ix.maxPainStrike == null) return null;
                  const diffPct = ((ix.spot - ix.maxPainStrike) / ix.maxPainStrike) * 100;
                  const above = diffPct >= 0;
                  return (
                    <div
                      key={ix.underlying}
                      className="flex items-center justify-between font-mono text-[10px] text-zinc-500"
                    >
                      <span>{ix.label}</span>
                      <span className="flex items-center gap-1 tabular-nums text-zinc-400">
                        {above ? (
                          <ArrowUp className="h-2.5 w-2.5 text-zinc-600" />
                        ) : (
                          <ArrowDown className="h-2.5 w-2.5 text-zinc-600" />
                        )}
                        {fmt(Math.abs(diffPct))}% {above ? "above" : "below"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
