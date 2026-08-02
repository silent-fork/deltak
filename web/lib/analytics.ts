declare global {
  interface Window {
    /** Cloudflare Zaraz's client library — injected at the edge, not by this app. */
    zaraz?: {
      track: (event: string, data?: Record<string, unknown>) => void;
    };
  }
}

/**
 * Session-level facts every event should carry — which underlying is
 * focused, whether Autopilot is armed, whether a broker session is live —
 * so any of GA4/Amplitude/Clarity can segment *all* activity by them
 * without re-sending the same three fields on every single track() call.
 * There's no cross-tool "user property" API in Zaraz's client library the
 * way there is in a single vendor's own SDK, so this just rides along as
 * ordinary event data instead — every tool wired to a track() sees it the
 * same way.
 */
let context: Record<string, unknown> = {};

/** Merges into the ambient context attached to every future `track()` call. */
export function setAnalyticsContext(patch: Record<string, unknown>): void {
  context = { ...context, ...patch };
}

/**
 * Fires a custom Zaraz event, if Zaraz's loader is actually present on the
 * page. Zaraz itself (the script, the tags, the trigger → action wiring)
 * lives in the Cloudflare dashboard for this zone, not in this repo — this
 * is only the client-side half: naming the moments the app's own logic
 * knows about that a generic page-load or CSS-selector click trigger can't
 * see on its own (an SPA state change, a signal firing, a position closing).
 *
 * A no-op wherever Zaraz isn't loaded — local dev, a preview deploy without
 * the zone's Zaraz config, or a browser blocking the script — so call sites
 * never need their own guard.
 */
export function track(event: string, data?: Record<string, unknown>): void {
  if (typeof window === "undefined" || !window.zaraz) return;
  window.zaraz.track(event, { ...context, ...data });
}
