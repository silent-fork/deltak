"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps the device's screen from dimming/locking while `active` — a signed-in
 * terminal tab someone is glancing at rather than actively touching, where
 * the OS's own idle timeout would otherwise kick in mid-session.
 *
 * The Wake Lock API only ever holds the screen awake for a *visible* tab —
 * the spec releases the lock itself the instant the page is hidden, and
 * never re-acquires it on its own. It cannot keep a backgrounded tab's own
 * timers (the engine's 1 Hz tick loop, market-data polling) running at full
 * rate once you switch away: that throttling is enforced by the browser for
 * battery/security reasons and no page-level API defeats it. The server-side
 * watchdog (`lib/server/watchdogGuards.ts`) is this app's real answer to
 * that — stop-loss, target and trailing-stop guards already re-run against
 * every open position on their own schedule, independent of whether any
 * browser tab is open at all.
 */
export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;

    let cancelled = false;
    const acquire = async () => {
      try {
        const sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) {
          void sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // Permission denied, unsupported despite the feature check, or the
        // page wasn't visible at request time — the visibilitychange
        // listener below retries once it is.
      }
    };

    void acquire();

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !sentinelRef.current) void acquire();
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      void sentinelRef.current?.release().catch(() => undefined);
      sentinelRef.current = null;
    };
  }, [active]);
}
