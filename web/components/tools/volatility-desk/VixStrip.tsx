"use client";

import { TriangleAlert } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, fmt } from "@/lib/utils";
import type { VixReading, VixRegime } from "@/lib/tools/volatilityDeskTypes";

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

export function VixStrip({ vix }: { vix: VixReading | null }) {
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
      </CardContent>
    </Card>
  );
}
