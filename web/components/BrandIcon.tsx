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
 * there — not worth collapsing into one shared wrapper). Only three sizes
 * exist across the app today, so `size` picks one rather than taking an
 * arbitrary number.
 */
const SIZES = {
  sm: { font: 17, cursorW: 4.5, cursorH: 12 },
  md: { font: 19, cursorW: 5, cursorH: 13.5 },
  lg: { font: 26, cursorW: 7, cursorH: 18.5 },
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
  return (
    <div className={cn("relative flex h-full w-full items-center justify-center", className)}>
      <span
        className={cn("inline-flex items-center font-mono font-extrabold leading-none text-quantum", glow && "text-glow-quantum")}
        style={{ fontSize: s.font }}
      >
        K
        <span
          className="inline-block bg-quantum"
          style={{
            width: s.cursorW,
            height: s.cursorH,
            marginLeft: s.font * 0.12,
            boxShadow: glow ? "0 0 10px rgba(0,240,255,0.55)" : undefined,
          }}
        />
      </span>
    </div>
  );
}
