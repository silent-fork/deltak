import { cn } from "@/lib/utils";

/**
 * The DELTAK wordmark, one place — three components rendered it with
 * identical styling and would have drifted the moment one of them changed.
 * "DELTA" reads as one plain word; only `K` carries the accent — the same
 * quantum-cyan glow the rest of the HUD marks its one live, active thing
 * with (the Quantum Horizon line, an armed band, a live tick). The blinking
 * cursor after it closes the mark like a live terminal prompt, full
 * cap-height so it reads as part of the same row as the letters.
 *
 * `font-display` (Space Grotesk) rather than the body/mono faces, so the
 * mark reads as a logotype instead of bold body text.
 *
 * Sizing is the caller's: pass the same text-size/tracking classes each
 * component already used its own wordmark with. The cursor scales in `em`
 * off that size.
 */
// Same intensity as `.text-glow-quantum` (0.55 opacity, 12px blur) — the
// established glow used everywhere else on the mark — applied as a
// box-shadow for the cursor, which isn't text.
const CURSOR_GLOW = { boxShadow: "0 0 12px rgba(0,240,255,0.55)" };

export function Wordmark({
  className,
  glow = true,
}: {
  className?: string;
  /** Drop the glow/blink — a quieter mark for a screen with its own ambient glow already going on. */
  glow?: boolean;
}) {
  // Not `cn()` for `text-quantum` + `text-glow-quantum`: tailwind-merge's
  // heuristic treats them as the same class group (both start `text-`) and
  // drops the color, same reasoning as this component always documented.
  const accent = `text-quantum${glow ? " text-glow-quantum" : ""}`;

  return (
    <span className={cn("inline-flex items-baseline font-display font-bold text-zinc-100", className)}>
      DELTA
      <span className={accent}>K</span>
      <span
        aria-hidden
        className={cn("ml-[0.22em] inline-block self-center bg-quantum", glow && "animate-pulse-ring")}
        style={{ width: "0.4em", height: "0.98em", ...(glow ? CURSOR_GLOW : null) }}
      />
    </span>
  );
}
