"use client";

import { Zap } from "lucide-react";
import Link from "next/link";

import { useTransitionLink } from "@/lib/useTransitionLink";

/**
 * A plain internal nav link (brand mark, breadcrumb crumb) with the same
 * route-transition acknowledgement `CtaLink` gives the terminal/learn/discuss
 * buttons — see `useTransitionLink`. No analytics event: unlike `CtaLink`
 * this covers wayfinding clicks, not calls to action.
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
    <Link href={href} className={className} aria-busy={pending} onClick={onClick}>
      {pending ? <Zap aria-hidden className="h-3.5 w-3.5 animate-dk-charge fill-current" /> : children}
    </Link>
  );
}
