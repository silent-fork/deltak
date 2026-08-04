/**
 * The forum's category set — fixed and curated, not user-created, the same
 * way `STRATEGIES`/`INDICES` in this directory are hand-maintained content
 * rather than a database table. Keeping categories here instead of in
 * Firestore means the `/discuss` hub never needs a database round trip just
 * to know what topics exist.
 */
export interface ForumCategory {
  slug: string;
  name: string;
  description: string;
  /** One line for the hub card and the category page's own meta description. */
  tagline: string;
}

export const FORUM_CATEGORIES: ForumCategory[] = [
  {
    slug: "news",
    name: "News",
    tagline: "Live market headlines, auto-updated — comment on any story",
    description:
      "Market headlines pulled in automatically from verified live sources, refreshed through the day. Every story is open underneath for discussion.",
  },
  {
    slug: "strategy",
    name: "Strategy",
    tagline: "Setups, adjustments and the trade-offs between them",
    description:
      "Options strategy discussion — construction, adjustments, and why one setup fits a read better than another.",
  },
  {
    slug: "market-talk",
    name: "Market Talk",
    tagline: "Sectors, indices and what today's tape is doing",
    description:
      "Live market and sector discussion — index moves, sector rotation, and what the tape is actually doing today.",
  },
  {
    slug: "feedback",
    name: "Feedback",
    tagline: "Bugs, requests and what DeltaK should build next",
    description: "Site feedback and bug reports — what's broken, what's missing, what to build next.",
  },
  {
    slug: "general",
    name: "General",
    tagline: "Everything else worth a thread",
    description: "General discussion — anything about trading, the markets, or DeltaK that doesn't fit elsewhere.",
  },
];

export function getForumCategory(slug: string): ForumCategory | undefined {
  return FORUM_CATEGORIES.find((c) => c.slug === slug);
}
