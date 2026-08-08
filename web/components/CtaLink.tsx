"use client";

import Link from "next/link";

import { BrandIcon } from "@/components/BrandIcon";
import { track } from "@/lib/analytics";
import { useTransitionLink } from "@/lib/useTransitionLink";

/**
 * A `next/link` that also fires a `cta_click` Zaraz event — the homepage
 * itself is a Server Component (real, crawlable HTML is the whole point of
 * it), so the one thing on the page that needs an onClick handler is split
 * out here rather than making the entire page a client component for it.
 *
 * Also the one place every "Terminal"/"Learn"/"FAQ" click in the product
 * passes through, so it's where a route transition's own pending state is
 * surfaced: /terminal's first paint is genuinely a beat away (client
 * bootstrap — scrip master, engine init), and a click with no acknowledgement
 * until then reads as missed, not slow. See `useTransitionLink`.
 */
export function CtaLink({
  href,
  location,
  event = "cta_click",
  data,
  className,
  pendingClassName,
  children,
}: {
  href: string;
  /** Which of the page's several identical CTAs this is — nav, hero, closing. */
  location: string;
  /** Override for a link that isn't really a call-to-action, e.g. a hub's tool card. */
  event?: string;
  data?: Record<string, unknown>;
  className?: string;
  /**
   * Full className replacement for the pending state, not a merge — most
   * callers are plain text buttons where the default swap already lands
   * centered, but a pill sized and padded around a specific multi-part
   * layout (see the homepage's hero FAQ pill) collapses off-center
   * around padding that was never meant to hold just the bolt alone.
   */
  pendingClassName?: string;
  children: React.ReactNode;
}) {
  const { pending, onClick } = useTransitionLink(href, () => track(event, { location, ...data }));

  return (
    <Link
      href={href}
      className={pending && pendingClassName ? pendingClassName : className}
      aria-busy={pending}
      onClick={onClick}
    >
      {/* A clean swap, not an overlay — a dimmed label with an icon stacked
          on top of it read as broken (letters bleeding through the glow)
          rather than loading. Nothing else on the button while it's pending,
          same as the label itself only ever shows one thing at a time. The
          bare K+cursor mark, not the bordered badge — a button is already
          its own frame, so a second border around the glyph inside it
          would be one too many. */}
      {pending ? (
        <span aria-hidden className="inline-flex h-4 w-4 shrink-0 animate-dk-charge items-center justify-center">
          <BrandIcon size="xs" />
        </span>
      ) : (
        children
      )}
    </Link>
  );
}
