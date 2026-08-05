"use client";

import Link from "next/link";

import { useTransitionLink } from "@/lib/useTransitionLink";

/**
 * A rich content card (thread, article, category) that becomes its own
 * loading skeleton while the destination page's own data is still in
 * flight — a category or thread page is `force-dynamic` (see their own
 * files), so it's a real Firestore read on every visit, not a cached
 * render. See `useTransitionLink` for the per-link pending state this
 * builds on.
 *
 * Unlike `NavLink` (identity — never hide the brand) this content *is*
 * about to be replaced by the destination page anyway, so a skeleton
 * standing in for it is honest rather than alarming. Reuses `.dk-skeleton`
 * — the shimmer this app already uses everywhere else a container's real
 * content isn't in yet — rather than inventing a second "loading" language
 * for the same idea.
 */
export function CardLink({
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
      {pending ? (
        // `w-full` matters here, not just tidiness — the thread-card variant
        // of this className is a horizontal flex row (`flex items-center`),
        // and without an explicit width this column div's own width comes
        // from its children's intrinsic size, which for percentage-width
        // bars is ~0: the row collapsed to a sliver instead of a skeleton.
        <div className="dk-skeleton flex w-full flex-col gap-2 py-0.5" aria-hidden>
          <div className="h-3 w-1/3 rounded bg-white/[0.06]" />
          <div className="h-4 w-3/4 rounded bg-white/[0.08]" />
          <div className="h-3 w-full rounded bg-white/[0.05]" />
          <div className="h-3 w-2/3 rounded bg-white/[0.05]" />
        </div>
      ) : (
        children
      )}
    </Link>
  );
}
