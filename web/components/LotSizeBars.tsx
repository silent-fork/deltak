import type { IndexProfile } from "@/lib/content/indices";

/**
 * A bar chart, not another column in the table above it — lot size
 * differences across indices are exactly the kind of comparison that reads
 * faster as relative bar lengths than as three numbers in a row.
 */
export function LotSizeBars({ indices }: { indices: IndexProfile[] }) {
  const known = indices.filter((i): i is IndexProfile & { lotSize: number } => i.lotSize !== null);
  if (known.length === 0) return null;
  const max = Math.max(...known.map((i) => i.lotSize));

  return (
    <div className="dk-panel space-y-2.5 rounded-lg p-4">
      {known.map((idx) => (
        <div key={idx.slug} className="flex items-center gap-3">
          <span className="w-24 shrink-0 truncate text-[11px] font-semibold text-zinc-300">{idx.name}</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-zinc-900">
            <div
              className="h-full rounded bg-quantum/50"
              style={{ width: `${Math.max(6, (idx.lotSize / max) * 100)}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right font-mono text-[11px] text-zinc-400">{idx.lotSize}</span>
        </div>
      ))}
    </div>
  );
}
