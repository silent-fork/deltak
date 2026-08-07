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
// Real last-edit dates for each static content section, pulled from git log
// on the source file the same way `strategies/[slug]/opengraph-image.tsx`'s
// `PUBLISHED_DATE` sources Article schema dates — an honest freshness signal
// instead of a stamped-at-build-time date that would just track deploys.
const LEARN_HUB_MODIFIED = new Date("2026-08-07T17:47:39+00:00");
const STRATEGIES_MODIFIED = new Date("2026-08-04T15:38:23+00:00");
const GLOSSARY_MODIFIED = new Date("2026-08-05T03:46:14+00:00");
const TRADING_STYLES_MODIFIED = new Date("2026-08-04T15:38:23+00:00");
const INDICES_MODIFIED = new Date("2026-08-05T03:46:14+00:00");
const BACKTEST_MODIFIED = new Date("2026-08-07T17:47:39+00:00");
const FAQ_MODIFIED = new Date("2026-08-07T11:39:41+00:00");
const HOME_MODIFIED = new Date("2026-08-07T17:47:39+00:00");
const TOOLS_HUB_MODIFIED = new Date("2026-08-07T00:00:00+00:00");

export default function sitemap(): MetadataRoute.Sitemap {
  // The four dashboards really do repaint on every visit against live NSE
  // data — "now" is the one honest `lastModified` for a page whose content
  // has no fixed edit date to point at.
  const toolsNow = new Date();

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      // The copy here doesn't change session to session the way the terminal's
      // own data does — "weekly" is the honest cadence for a marketing page.
      changeFrequency: "weekly",
      priority: 1,
      lastModified: HOME_MODIFIED,
    },
    { url: `${SITE_URL}/tools`, changeFrequency: "monthly", priority: 0.8, lastModified: TOOLS_HUB_MODIFIED },
    { url: `${SITE_URL}/tools/fno-sector-rotation`, changeFrequency: "daily", priority: 0.8, lastModified: toolsNow },
    { url: `${SITE_URL}/tools/market-scanner`, changeFrequency: "daily", priority: 0.8, lastModified: toolsNow },
    { url: `${SITE_URL}/tools/volatility-desk`, changeFrequency: "daily", priority: 0.8, lastModified: toolsNow },
    { url: `${SITE_URL}/tools/corporate-calendar`, changeFrequency: "daily", priority: 0.8, lastModified: toolsNow },
    { url: `${SITE_URL}/learn`, changeFrequency: "monthly", priority: 0.8, lastModified: LEARN_HUB_MODIFIED },
    { url: `${SITE_URL}/learn/strategies`, changeFrequency: "monthly", priority: 0.7, lastModified: STRATEGIES_MODIFIED },
    { url: `${SITE_URL}/learn/glossary`, changeFrequency: "monthly", priority: 0.7, lastModified: GLOSSARY_MODIFIED },
    { url: `${SITE_URL}/learn/trading-styles`, changeFrequency: "monthly", priority: 0.6, lastModified: TRADING_STYLES_MODIFIED },
    { url: `${SITE_URL}/learn/indices`, changeFrequency: "monthly", priority: 0.6, lastModified: INDICES_MODIFIED },
    { url: `${SITE_URL}/learn/backtest`, changeFrequency: "monthly", priority: 0.7, lastModified: BACKTEST_MODIFIED },
    { url: `${SITE_URL}/faq`, changeFrequency: "monthly", priority: 0.6, lastModified: FAQ_MODIFIED },
  ];

  // Every /learn/* leaf page is static content with no live data behind it —
  // "monthly" is the honest cadence for the whole wiki, hub pages included.
  const strategyEntries: MetadataRoute.Sitemap = STRATEGIES.map((s) => ({
    url: `${SITE_URL}/learn/strategies/${s.slug}`,
    changeFrequency: "monthly",
    priority: 0.6,
    lastModified: STRATEGIES_MODIFIED,
  }));

  const glossaryEntries: MetadataRoute.Sitemap = GLOSSARY.map((g) => ({
    url: `${SITE_URL}/learn/glossary/${g.slug}`,
    changeFrequency: "monthly",
    priority: 0.5,
    lastModified: GLOSSARY_MODIFIED,
  }));

  const styleEntries: MetadataRoute.Sitemap = TRADING_STYLES.map((s) => ({
    url: `${SITE_URL}/learn/trading-styles/${s.slug}`,
    changeFrequency: "monthly",
    priority: 0.5,
    lastModified: TRADING_STYLES_MODIFIED,
  }));

  const indexEntries: MetadataRoute.Sitemap = INDICES.map((i) => ({
    url: `${SITE_URL}/learn/indices/${i.slug}`,
    changeFrequency: "monthly",
    priority: 0.5,
    lastModified: INDICES_MODIFIED,
  }));

  return [
    ...staticEntries,
    ...strategyEntries,
    ...glossaryEntries,
    ...styleEntries,
    ...indexEntries,
  ];
}
