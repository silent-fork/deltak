declare global {
  interface Window {
    /** Cloudflare Zaraz's client library — injected at the edge, not by this app. */
    zaraz?: {
      track: (event: string, data?: Record<string, unknown>) => void;
    };
  }
}

/**
 * Fires a custom Zaraz event, if Zaraz's loader is actually present on the
 * page. Zaraz itself (the script, the GA4 tag, the trigger → tag wiring)
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
  window.zaraz.track(event, data);
}
