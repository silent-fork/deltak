const SITE_URL =
  process.env.NEXT_PUBLIC_DK_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/**
 * A route handler rather than the `app/robots.ts` special file it replaces:
 * Next.js's typed `MetadataRoute.Robots` return shape only knows
 * `rules`/`sitemap`/`host`, and its actual serializer (checked in
 * `resolve-route-data.js`, not just the `.d.ts`) only ever emits
 * User-Agent/Allow/Disallow/Crawl-delay/Host/Sitemap lines from that —
 * there is no field that reaches a `Content-Signal:` line. Plain text here
 * gets the exact line the typed generator can't emit, same pattern already
 * used for llms.txt/llms-full.txt.
 *
 * Pure plumbing, not content, for any crawler: the Angel One app
 * registration's redirect URL and the API routes the terminal calls under
 * the hood. /terminal is deliberately *not* listed here despite being
 * noindex — a crawler has to actually fetch a page to see its noindex meta
 * tag, so disallowing it here would hide that tag rather than enforce it.
 */
const DISALLOW = ["/api/", "/auth/callback"];

/**
 * search=yes: fine to index and surface in search results (the whole point
 * of the sitemap below). ai-train=no: not to be used as training data.
 * use=reference: fine for an AI answer engine to fetch, quote and cite this
 * page for a specific query — the same posture the `LLM_AGENTS` allow-list
 * below already takes by letting them crawl at all.
 */
const CONTENT_SIGNAL = "Content-Signal: search=yes, ai-train=no, use=reference";

/**
 * Named explicitly, not left to fall through the wildcard rule: a named
 * user-agent group replaces the wildcard entirely for that agent under the
 * robots.txt spec — which is exactly why `Content-Signal` has to be
 * repeated inside each of these blocks too, not just the wildcard one:
 * these crawlers never see the wildcard block's lines at all once they
 * have a block of their own.
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

function block(userAgent: string): string {
  return [
    `User-agent: ${userAgent}`,
    "Allow: /",
    ...DISALLOW.map((d) => `Disallow: ${d}`),
    CONTENT_SIGNAL,
  ].join("\n");
}

function content(): string {
  const blocks = ["*", ...LLM_AGENTS].map(block).join("\n\n");
  return `${blocks}\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

export function GET() {
  return new Response(content(), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
    },
  });
}
