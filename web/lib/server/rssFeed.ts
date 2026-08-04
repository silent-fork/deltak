import "server-only";

/**
 * A small, dependency-free RSS 2.0 reader for the feeds `/discuss`'s News
 * category ingests from — regex-based rather than a real XML parser (Node
 * has none built in, and this app avoids adding one the same way it avoids
 * every other dependency the REST-only architecture doesn't strictly need;
 * see `lib/server/firestore.ts`'s own header comment for the same
 * reasoning applied to Firestore). This only ever needs to survive
 * standard `<item>` blocks with `<title>`/`<link>`/`<description>`/
 * `<pubDate>` — confirmed against a live fetch of Pulse's own feed, not
 * assumed from the RSS spec — so it does not attempt general XML,
 * namespaces, or nested items.
 */

export interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string | null;
}

export interface FeedSource {
  /** Shown as the byline on every thread this source creates. */
  name: string;
  url: string;
}

/**
 * The only source confirmed live and reachable as an actual feed — a
 * direct fetch of `pulse.zerodha.com/feed.php` returns real RSS,
 * `<title>Pulse by Zerodha</title>`, 25 items, all well-formed. The other
 * two URLs a user pasted alongside this one ("Markets Feed", "Stocks
 * Feed", "Top Stories") all resolved to the same bare `indiatimes.com`
 * homepage, which 403s and serves an HTML error page — not a working feed
 * endpoint, so nothing here points at it. Add a source by appending to
 * this array once a real, distinct feed URL is confirmed the same way.
 */
export const FEED_SOURCES: FeedSource[] = [
  { name: "Market Pulse", url: "https://pulse.zerodha.com/feed.php" },
];

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => NAMED_ENTITIES[name] ?? `&${name};`);
}

function extractField(itemXml: string, tag: string): string | null {
  const match = itemXml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  if (!match) return null;
  let value = match[1].trim();
  const cdata = value.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
  if (cdata) value = cdata[1].trim();
  return decodeEntities(value).trim();
}

/** Parses every `<item>` block in an RSS 2.0 document into plain objects. */
export function parseRssFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const itemBlocks = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? [];
  for (const block of itemBlocks) {
    const title = extractField(block, "title");
    const link = extractField(block, "link");
    if (!title || !link) continue; // Nothing worth a thread without both.
    items.push({
      title,
      link,
      description: extractField(block, "description") ?? "",
      pubDate: extractField(block, "pubDate"),
    });
  }
  return items;
}

export async function fetchFeed(source: FeedSource, timeoutMs = 10_000): Promise<FeedItem[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(source.url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`${source.name} feed fetch failed (${res.status})`);
    const xml = await res.text();
    return parseRssFeed(xml);
  } finally {
    clearTimeout(timer);
  }
}
