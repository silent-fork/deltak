"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Drives a single `<Link>`'s own pending state through a route transition.
 *
 * `useTransition()` on its own reports whether *any* transition this
 * component started is in flight — fine for a page with one button, wrong
 * for a nav rail with several: clicking Terminal must not light up Learn's
 * spinner too. `pendingHref` pins the pending flag to the href this
 * particular click actually navigated to.
 *
 * Exists because a plain `<Link>` gives no feedback between the click and
 * the new route's first paint — fine on a fast local network, misleading
 * here, where /terminal's own client bootstrap (master download, engine
 * init) is genuinely slow enough that an un-acknowledged click reads as a
 * missed click, not a slow one.
 */
export function useTransitionLink(href: string, onNavigate?: () => void) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const pending = isPending && pendingHref === href;

  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    // Modified clicks (open in new tab, etc.) and anything already handled
    // upstream get the browser's own default behaviour, untouched.
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    onNavigate?.();
    e.preventDefault();
    setPendingHref(href);
    startTransition(() => router.push(href));
  }

  return { pending, onClick };
}
