import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_DK_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          // Pure plumbing for the Angel One app registration's redirect URL —
          // nothing here is ever worth a search result. /terminal is
          // deliberately *not* listed here despite being noindex: Google has
          // to actually crawl a page to see its noindex meta tag, so
          // disallowing it here would hide that tag rather than enforce it.
          "/auth/callback",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
