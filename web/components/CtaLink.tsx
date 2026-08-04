"use client";

import Link from "next/link";

import { track } from "@/lib/analytics";

/**
 * A `next/link` that also fires a `cta_click` Zaraz event — the homepage
 * itself is a Server Component (real, crawlable HTML is the whole point of
 * it), so the one thing on the page that needs an onClick handler is split
 * out here rather than making the entire page a client component for it.
 */
export function CtaLink({
  href,
  location,
  event = "cta_click",
  data,
  className,
  children,
}: {
  href: string;
  /** Which of the page's several identical CTAs this is — nav, hero, closing. */
  location: string;
  /** Override for a link that isn't really a call-to-action, e.g. a hub's tool card. */
  event?: string;
  data?: Record<string, unknown>;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={className}
      onClick={() => track(event, { location, ...data })}
    >
      {children}
    </Link>
  );
}
