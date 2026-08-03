"use client";

import { useEffect } from "react";

import { track } from "@/lib/analytics";

/**
 * Fires one Zaraz event on mount, for a page that's otherwise a Server
 * Component with nothing else to hydrate — `track()` needs `window`, which a
 * server-rendered page never has a hook into on its own. Data is captured at
 * mount and never re-sent; a page whose event data can change should call
 * `track()` itself instead of reaching for this.
 */
export function AnalyticsBeacon({
  event,
  data,
}: {
  event: string;
  data?: Record<string, unknown>;
}) {
  useEffect(() => {
    track(event, data);
    // Fire once, with whatever data mount-time had — not on every re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
