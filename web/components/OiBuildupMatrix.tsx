import { ArrowDown, ArrowUp } from "lucide-react";

/**
 * The four price-vs-OI combinations as an actual 2x2 grid rather than a
 * paragraph of prose — the same quadrant visual language DeltaK's own RRG
 * reads strikes into (Leading/Improving/Weakening/Lagging), applied here to
 * price direction against open-interest direction instead.
 */
const CELLS = [
  {
    price: "up",
    oi: "up",
    label: "Long Buildup",
    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
    body: "Fresh, confident buying — new longs entering, not shorts closing out.",
  },
  {
    price: "down",
    oi: "up",
    label: "Short Buildup",
    tone: "border-rose-500/30 bg-rose-500/10 text-rose-400",
    body: "Fresh, confident selling — new shorts entering, conviction behind the move down.",
  },
  {
    price: "up",
    oi: "down",
    label: "Short Covering",
    tone: "border-quantum/40 bg-quantum/10 text-quantum",
    body: "Shorts closing out into strength — not new buying conviction, and often fades once covering is done.",
  },
  {
    price: "down",
    oi: "down",
    label: "Long Unwinding",
    tone: "border-zinc-700 bg-zinc-900/60 text-zinc-400",
    body: "Longs closing out into weakness — not new selling pressure, just exposure coming off.",
  },
] as const;

export function OiBuildupMatrix() {
  return (
    <div className="dk-panel rounded-lg p-4">
      <div className="grid grid-cols-[auto_1fr_1fr] gap-2">
        <div />
        <div className="flex items-center justify-center gap-1 pb-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
          <ArrowUp className="h-3 w-3" /> Price Up
        </div>
        <div className="flex items-center justify-center gap-1 pb-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
          <ArrowDown className="h-3 w-3" /> Price Down
        </div>

        <div className="flex items-center justify-center gap-1 pr-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500 [writing-mode:vertical-rl]">
          <ArrowUp className="h-3 w-3 rotate-90" /> OI Up
        </div>
        {CELLS.filter((c) => c.oi === "up").map((c) => (
          <div key={c.label} className={`rounded-md border p-3 ${c.tone}`}>
            <p className="text-[12.5px] font-semibold">{c.label}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{c.body}</p>
          </div>
        ))}

        <div className="flex items-center justify-center gap-1 pr-1 font-mono text-[9px] uppercase tracking-wider text-zinc-500 [writing-mode:vertical-rl]">
          <ArrowDown className="h-3 w-3 rotate-90" /> OI Down
        </div>
        {CELLS.filter((c) => c.oi === "down").map((c) => (
          <div key={c.label} className={`rounded-md border p-3 ${c.tone}`}>
            <p className="text-[12.5px] font-semibold">{c.label}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">{c.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
