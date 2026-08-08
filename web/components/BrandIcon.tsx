import { cn } from "@/lib/utils";

/**
 * The badge mark, one place — same reasoning as `Wordmark.tsx`: every caller
 * rendered its own copy of the old bolt SVG and would have drifted the
 * moment one of them changed. Built entirely from pieces the wordmark
 * already owns rather than a new shape: the same `K` and the same blinking
 * cursor rectangle.
 *
 * Fills whatever fixed-size box the caller already wraps it in (every call
 * site already has its own `h-N w-N rounded-md border ...` badge div, with
 * per-context variations — an extra glow shadow here, a fade-up animation
 * there — not worth collapsing into one shared wrapper). Only four sizes
 * exist across the app today, so `size` picks one rather than taking an
 * arbitrary number.
 */
const SIZES = {
  xs: { font: 10, cursorW: 4, cursorH: 9.5 },
  sm: { font: 14, cursorW: 5.5, cursorH: 13 },
  md: { font: 16, cursorW: 6, cursorH: 15 },
  lg: { font: 22, cursorW: 8.5, cursorH: 21 },
} as const;

export function BrandIcon({
  size = "md",
  glow = true,
  className,
}: {
  size?: keyof typeof SIZES;
  /** Drop the glow/blink — a quieter mark for a screen with its own ambient glow already going on. */
  glow?: boolean;
  className?: string;
}) {
  const s = SIZES[size];
  // A dimmer glow than the wordmark's `.text-glow-quantum` (12px/0.55) on
  // purpose: that intensity was tuned for a `K` sitting inline in body-sized
  // text, and the same fixed blur radius reads as a much heavier bloom on
  // this mark's larger, bolder monospace letterform inside a small badge.
  const textShadow = glow ? "0 0 6px rgba(0,240,255,0.4)" : undefined;
  const cursorShadow = glow ? "0 0 6px rgba(0,240,255,0.4)" : undefined;
  return (
    <div className={cn("relative flex h-full w-full items-center justify-center", className)}>
      <span
        className="inline-flex items-baseline font-mono font-extrabold leading-none text-quantum"
        style={{ fontSize: s.font, textShadow }}
      >
        K
        <span
          className={cn("inline-block bg-quantum", glow && "animate-pulse-ring")}
          style={{
            width: s.cursorW,
            height: s.cursorH,
            marginLeft: s.font * 0.22,
            boxShadow: cursorShadow,
          }}
        />
      </span>
    </div>
  );
}
