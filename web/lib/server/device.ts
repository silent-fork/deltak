/**
 * Coarse mobile detection for one purpose only: deciding whether `/terminal`
 * renders the full desktop engine or the read-only pairing/companion view.
 *
 * Not tagged `server-only` — it's a pure string test with no server secret
 * behind it, so nothing is lost by letting it be imported anywhere.
 */
const MOBILE_UA_RE = /Android|iPhone|iPod|iPad|Mobile|IEMobile|BlackBerry/i;

export function isMobileUserAgent(userAgent: string | null | undefined): boolean {
  return MOBILE_UA_RE.test(userAgent ?? "");
}
