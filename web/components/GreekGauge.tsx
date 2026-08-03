/**
 * A shared sensitivity gauge for the Greeks glossary entries — delta, gamma
 * and vega all boil down to "how much does X move for a unit move in Y",
 * which reads far faster as two marked positions on a bar than as prose.
 */
type GaugeKind = "delta" | "gamma" | "vega" | "iv";

const CONFIG: Record<
  GaugeKind,
  { min: number; max: number; deep: number; far: number; deepLabel: string; farLabel: string; unit: string }
> = {
  delta: { min: 0, max: 1, deep: 0.65, far: 0.15, deepLabel: "24,900 call (100pt ITM)", farLabel: "25,200 call (far OTM)", unit: "Δ" },
  gamma: { min: 0, max: 1, deep: 0.65, far: 0.45, deepLabel: "last session before expiry", farLabel: "a week before expiry", unit: "Δ shift" },
  vega: { min: 300, max: 450, deep: 420, far: 330, deepLabel: "ATM straddle, IV at 18%", farLabel: "ATM straddle, IV at 14%", unit: "₹ combined" },
  iv: { min: 8, max: 20, deep: 17, far: 11.5, deepLabel: "heading into a policy day", farLabel: "a quiet week", unit: "% IV" },
};

export function GreekGauge({ kind }: { kind: GaugeKind }) {
  const c = CONFIG[kind];
  const pct = (v: number) => ((v - c.min) / (c.max - c.min)) * 100;

  return (
    <div className="space-y-3">
      <div className="relative h-2 rounded-full bg-zinc-900">
        <div className="h-full rounded-full bg-gradient-to-r from-zinc-700 via-quantum/50 to-quantum" style={{ width: "100%" }} />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-zinc-950 bg-rose-400"
          style={{ left: `${pct(c.far)}%` }}
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-zinc-950 bg-emerald-400"
          style={{ left: `${pct(c.deep)}%` }}
        />
      </div>
      <div className="flex justify-between font-mono text-[9px] text-zinc-500">
        <span>
          {c.min} {c.unit}
        </span>
        <span>
          {c.max} {c.unit}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 text-[11px]">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-rose-400" />
          <span className="text-zinc-400">
            {c.farLabel}: <span className="font-mono text-zinc-200">{c.far}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          <span className="text-zinc-400">
            {c.deepLabel}: <span className="font-mono text-zinc-200">{c.deep}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
