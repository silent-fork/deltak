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
        source: "/tools/expiry-calendar",
        destination: "/learn",
        permanent: true,
      },
      {
        source: "/tools",
        destination: "/learn",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
