import { QUADRANT_META, cn } from "@/lib/utils";
import type { Quadrant } from "@/lib/types";

export function QuadrantPill({
  quadrant,
  compact = false,
  className,
}: {
  quadrant: Quadrant | null | undefined;
  compact?: boolean;
  className?: string;
}) {
  if (!quadrant) {
    return (
      <span className={cn("font-mono text-[10px] text-zinc-700", className)}>
        —
      </span>
    );
  }
  const meta = QUADRANT_META[quadrant];
  return (
    <span
      title={meta.note}
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1 py-px font-mono text-[9px] font-semibold uppercase leading-none tracking-wide",
        meta.tone,
        className,
      )}
    >
      <span className={cn("h-1 w-1 rounded-full", meta.dot)} />
      {compact ? meta.label.slice(0, 4) : meta.label}
    </span>
  );
}
