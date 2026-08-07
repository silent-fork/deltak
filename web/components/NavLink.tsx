"use client";

import Link from "next/link";

import { useTransitionLink } from "@/lib/useTransitionLink";

/**
 * A plain internal nav link (brand mark, breadcrumb crumb) with the same
 * route-transition acknowledgement `CtaLink` gives the terminal/learn/faq
 * buttons — see `useTransitionLink`. No analytics event: unlike `CtaLink`
 * this covers wayfinding clicks, not calls to action.
 *
 * Unlike `CtaLink`, the content here never swaps out — the brand mark and
 * breadcrumb crumbs are identity, not a call to action, and hiding a logo
 * mid-navigation reads as the brand itself glitching, not a loading state.
 * A small ping badge sits in the corner instead, acknowledging the click
 * without touching what's underneath it.
 */
export function NavLink({
  href,
  className,
  children,
}: {
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { pending, onClick } = useTransitionLink(href);

  return (
    <Link href={href} className={`relative ${className ?? ""}`} aria-busy={pending} onClick={onClick}>
      {children}
      {pending ? (
        <span aria-hidden className="pointer-events-none absolute -right-1 -top-1 flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-quantum/70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-quantum" />
        </span>
      ) : null}
    </Link>
  );
}
