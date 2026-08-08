import { cn } from "@/lib/utils";

/**
 * The DELTAK wordmark, one place — three components rendered it with
 * identical styling and would have drifted the moment one of them changed.
 * "DELTA" reads as one plain word; only `K` carries the accent — the same
 * quantum-cyan glow the rest of the HUD marks its one live, active thing
 * with (the Quantum Horizon line, an armed band, a live tick). No trailing
 * cursor here — that lives on `BrandIcon`'s badge now, and the two sitting
 * side by side each blinking their own was one cursor too many.
 *
 * `font-display` (Space Grotesk) rather than the body/mono faces, so the
 * mark reads as a logotype instead of bold body text.
 *
 * Sizing is the caller's: pass the same text-size/tracking classes each
 * component already used its own wordmark with.
 */
export function Wordmark({
  className,
  glow = true,
}: {
  className?: string;
  /** Drop the glow — a quieter mark for a screen with its own ambient glow already going on. */
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
    </span>
  );
}
