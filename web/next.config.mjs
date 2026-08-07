/**
 * Content-Security-Policy — every external origin this app actually talks
 * to, and nothing else. Compiled from the real call sites, not a generic
 * template:
 *   - wss://api-feed.dhan.co / wss://smartapisocket.angelone.in — the
 *     market-feed sockets `lib/stream/dhanfeed.ts` / `smartstream.ts` open
 *     directly from the browser (see those files for why it isn't relayed
 *     through a server-side socket).
 *   - challenges.cloudflare.com — the Turnstile widget on login, both its
 *     script and the iframe it renders.
 *   - vitals.vercel-insights.com / va.vercel-scripts.com — `@vercel/analytics`
 *     and `@vercel/speed-insights`; harmless to over-allow since a CSP block
 *     here only silently drops telemetry, never breaks the app.
 * `script-src`/`style-src` keep 'unsafe-inline': Next's App Router injects
 * inline hydration data on every page, and this app uses inline `style={}`
 * throughout (chart bars, computed widths) — a nonce-based CSP that drops
 * this is a real upgrade but needs middleware.ts to thread a per-request
 * nonce through, out of scope for a headers-only pass.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' wss://api-feed.dhan.co wss://smartapisocket.angelone.in https://challenges.cloudflare.com https://vitals.vercel-insights.com https://va.vercel-scripts.com",
  "frame-src https://challenges.cloudflare.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // Belt-and-suspenders with frame-ancestors above — CSP wins in any browser
  // that honours it, this covers the few that only understand the old header.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Explicit-deny list, not a template default: only the browser features
  // this app actually has no use for. Wake Lock (used on /terminal) is
  // deliberately absent from this list so it stays available same-origin.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No external backend: every /api/* path is a route handler in this
  // deployment, and the market feed is a WebSocket opened by the browser.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
  async redirects() {
    return [
      {
        // The old expiry-calendar tool page was retired in favour of the
        // /learn wiki. A 301 rather than a silent 404 preserves whatever
        // link equity or indexing the old URL had already picked up.
        // NOTE: "/tools" itself used to redirect here too, from back when
        // the whole /tools path was retired — it's real, live content
        // again now (the /tools hub and its dashboards), so that blanket
        // redirect had to go; this one path-specific redirect still holds
        // since nothing under /tools reclaims "expiry-calendar".
        source: "/tools/expiry-calendar",
        destination: "/learn",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
