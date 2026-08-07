import type { MetadataRoute } from "next";

import { GLOSSARY } from "@/lib/content/glossary";
import { INDICES } from "@/lib/content/indices";
import { STRATEGIES } from "@/lib/content/strategies";
import { TRADING_STYLES } from "@/lib/content/tradingStyles";

const SITE_URL =
  process.env.NEXT_PUBLIC_DK_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/**
 * "/", everything under "/learn", "/tools", and "/faq" is what's meant to
 * rank — real content with no login gate to read at all. "/terminal" is the
 * app itself, marked `noindex` on its own page (see app/terminal/page.tsx):
 * Google's own guidance is to leave noindex pages out of the sitemap rather
 * than submit a URL you're simultaneously telling it not to index. Everything
 * else is an API route or the OAuth callback, neither of which is content.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      // The copy here doesn't change session to session the way the terminal's
      // own data does — "weekly" is the honest cadence for a marketing page.
      changeFrequency: "weekly",
      priority: 1,
    },
    { url: `${SITE_URL}/tools`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/tools/fno-sector-rotation`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/tools/market-scanner`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/tools/volatility-desk`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/tools/corporate-calendar`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/learn`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/learn/strategies`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/learn/glossary`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/learn/trading-styles`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/learn/indices`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/learn/backtest`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.6 },
  ];

  // Every /learn/* leaf page is static content with no live data behind it —
  // "monthly" is the honest cadence for the whole wiki, hub pages included.
  const strategyEntries: MetadataRoute.Sitemap = STRATEGIES.map((s) => ({
    url: `${SITE_URL}/learn/strategies/${s.slug}`,
    changeFrequency: "monthly",
    priority: 0.6,
  }));

  const glossaryEntries: MetadataRoute.Sitemap = GLOSSARY.map((g) => ({
    url: `${SITE_URL}/learn/glossary/${g.slug}`,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  const styleEntries: MetadataRoute.Sitemap = TRADING_STYLES.map((s) => ({
    url: `${SITE_URL}/learn/trading-styles/${s.slug}`,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  const indexEntries: MetadataRoute.Sitemap = INDICES.map((i) => ({
    url: `${SITE_URL}/learn/indices/${i.slug}`,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  return [
    ...staticEntries,
    ...strategyEntries,
    ...glossaryEntries,
    ...styleEntries,
    ...indexEntries,
  ];
}
