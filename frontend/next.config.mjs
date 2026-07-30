/** @type {import('next').NextConfig} */
const backend = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  // Proxy the engine through the Next origin so SSE and fetch share an origin
  // (no CORS preflight, and EventSource works behind a single hostname).
  //
  // The negative lookahead is load-bearing. Array-form rewrites run after
  // static filesystem routes but *before dynamic routes*, and
  // /api/history/[resource] is dynamic — so a bare `/api/:path*` swallows it
  // and forwards history reads to the engine instead of the Supabase-backed
  // route handler. Excluding the prefix here is what lets that handler run.
  async rewrites() {
    return [
      {
        source: "/api/:path((?!history/).*)",
        destination: `${backend}/api/:path`,
      },
    ];
  },
};

export default nextConfig;
