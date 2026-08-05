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
    <Link href={href} className={`relative ${className ?? ""}`} aria-busy={pending} onClick={onClick}>
      <span className={pending ? "contents opacity-25" : "contents"}>{children}</span>
      {pending ? (
        <Zap
          aria-hidden
          className="pointer-events-none absolute inset-0 m-auto h-3.5 w-3.5 animate-dk-charge fill-current"
        />
      ) : null}
    </Link>
  );
}
