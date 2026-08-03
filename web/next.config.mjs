/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No external backend: every /api/* path is a route handler in this
  // deployment, and the market feed is a WebSocket opened by the browser.
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
