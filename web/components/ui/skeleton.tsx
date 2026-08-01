import { cn } from "@/lib/utils";

/**
 * A placeholder in the shape of the thing that is coming.
 *
 * "Warming up…" centred in an empty card tells an operator nothing about what
 * will appear there, and every panel looked identical while it waited. A
 * skeleton in the panel's own geometry says what is loading and roughly how
 * much of it, and the layout does not jump when the data lands.
 *
 * The shimmer is decorative and stops for anyone who has asked for reduced
 * motion; the shapes remain, because they are the information.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("dk-skeleton rounded bg-zinc-800/60", className)}
      {...props}
    />
  );
}

/** A labelled block of skeleton rows, for panels that need a caption. */
export function SkeletonPanel({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("flex min-h-0 flex-1 flex-col gap-1.5", className)}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
