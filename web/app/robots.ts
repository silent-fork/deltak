import type { MetadataRoute } from "next";

const SITE_URL =
  process.env.NEXT_PUBLIC_DK_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/**
 * Pure plumbing, not content, for any crawler: the Angel One app
 * registration's redirect URL and the API routes the terminal calls under
 * the hood. /terminal is deliberately *not* listed here despite being
 * noindex — a crawler has to actually fetch a page to see its noindex meta
 * tag, so disallowing it here would hide that tag rather than enforce it.
 */
const DISALLOW = ["/api/", "/auth/callback"];

/**
 * Named explicitly, not left to fall through the wildcard rule: a named
 * user-agent group replaces the wildcard entirely for that agent under the
 * robots.txt spec, so being explicit here is what actually guarantees these
 * crawlers see an unambiguous "allowed" rather than depending on whichever
 * default posture a given bot assumes when it finds no rule naming it.
 */
const LLM_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "Google-Extended",
  "PerplexityBot",
  "Perplexity-User",
  "CCBot",
  "Applebot-Extended",
  "Bytespider",
  "Amazonbot",
  "meta-externalagent",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: DISALLOW },
      ...LLM_AGENTS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: DISALLOW,
      })),
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
