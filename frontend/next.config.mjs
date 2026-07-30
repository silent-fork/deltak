/** @type {import('next').NextConfig} */
const backend = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

const nextConfig = {
  reactStrictMode: true,
  // Proxy the engine through the Next origin so SSE and fetch share an origin
  // (no CORS preflight, and EventSource works behind a single hostname).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
