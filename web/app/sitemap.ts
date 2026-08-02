import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_DK_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/**
 * "/" and the tool pages under "/tools" are what's meant to rank — real,
 * server-rendered content. "/terminal" is the app itself, marked `noindex`
 * on its own page (see app/terminal/page.tsx): Google's own guidance is to
 * leave noindex pages out of the sitemap rather than submit a URL you're
 * simultaneously telling it not to index. Everything else is an API route
 * or the OAuth callback, neither of which is content.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      // The copy here doesn't change session to session the way the terminal's
      // own data does — "weekly" is the honest cadence for a marketing page.
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/tools/expiry-calendar`,
      // The scrip master it reads is refetched hourly and the expiry list
      // itself only moves week to week, but "daily" is still the more honest
      // signal to a crawler than "weekly" for a page with a live data source.
      changeFrequency: "daily",
      priority: 0.7,
    },
  ];
}
