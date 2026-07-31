/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // No rewrites and no external backend: every /api/* path is a route handler in
  // this deployment, and the market feed is a WebSocket opened by the browser.
};

export default nextConfig;
