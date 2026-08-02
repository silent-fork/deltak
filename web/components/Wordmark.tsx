import { cn } from "@/lib/utils";

/**
 * The DELTAK wordmark, one place — three components rendered it with
 * identical styling and would have drifted the moment one of them changed.
 * `K` carries the accent: the same quantum-cyan glow the rest of the HUD
 * marks its one live, active thing with (the Quantum Horizon line, an armed
 * band, a live tick).
 *
 * Sizing is the caller's: pass the same text-size/tracking classes each
 * component already used its own wordmark with.
 */
export function Wordmark({
  className,
  glow = true,
}: {
  className?: string;
  /** Drop the "K"'s text-shadow — a quieter mark for a screen with its own ambient glow already going on. */
  glow?: boolean;
}) {
  return (
    <span className={cn("font-bold text-zinc-100", className)}>
      DELTA<span className={cn("text-quantum", glow && "text-glow-quantum")}>K</span>
    </span>
  );
}
