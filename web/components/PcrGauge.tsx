/**
 * PCR read as a lean rather than a single number — where 1.4 sits between
 * "more calls" and "more puts" matters more than the raw ratio.
 */
export function PcrGauge() {
  const value = 1.4;
  const min = 0.5;
  const max = 2.0;
  const pct = ((value - min) / (max - min)) * 100;
  const neutralPct = ((1 - min) / (max - min)) * 100;

  return (
    <div className="space-y-2">
      <div className="relative h-2.5 rounded-full bg-gradient-to-r from-emerald-500/40 via-zinc-700 to-rose-500/40">
        <div
          className="absolute top-1/2 h-0.5 w-px bg-zinc-500"
          style={{ left: `${neutralPct}%` }}
        />
        <div
          className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-zinc-950 bg-quantum"
          style={{ left: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between font-mono text-[9px] uppercase tracking-wider text-zinc-500">
        <span className="text-emerald-400">More calls · {min}</span>
        <span>Balanced · 1.0</span>
        <span className="text-rose-400">More puts · {max}</span>
      </div>
      <p className="text-center font-mono text-[10px] text-zinc-400">
        PCR {value} — read alongside where that OI actually sits, not on its own
      </p>
    </div>
  );
}
