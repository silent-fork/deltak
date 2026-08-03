/**
 * A shared timeline strip across every trading-style page — three zones
 * (Intraday, Swing, Positional) sized on a rough log scale from minutes to
 * a monthly cycle, with the current style's zone lit up. "Buying vs.
 * Selling" cuts across all three, so it lights the whole strip instead of
 * one zone — the visual itself makes the point that it's an orthogonal
 * question, not a fourth zone on the same axis.
 */
const ZONES = [
  { slug: "intraday-options-trading", label: "Intraday", width: 18 },
  { slug: "swing-options-trading", label: "Swing", width: 27 },
  { slug: "positional-options-trading", label: "Positional", width: 40 },
] as const;

export function TimeHorizonBar({ activeSlug }: { activeSlug: string }) {
  const crossCutting = activeSlug === "options-buying-vs-selling";

  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-900">
        {ZONES.map((z, i) => {
          const active = crossCutting || z.slug === activeSlug;
          return (
            <div
              key={z.slug}
              style={{ width: `${z.width}%` }}
              className={`h-full ${active ? "bg-quantum" : "bg-zinc-800"} ${
                i > 0 ? "border-l border-zinc-950" : ""
              }`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex text-[8px] uppercase tracking-wider text-zinc-600">
        {ZONES.map((z) => (
          <span key={z.slug} style={{ width: `${z.width}%` }} className="truncate">
            {z.label}
          </span>
        ))}
      </div>
    </div>
  );
}
