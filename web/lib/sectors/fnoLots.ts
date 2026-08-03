import "server-only";

import os from "node:os";

import { NSEClient } from "nse-bse-api";

/**
 * The complete F&O-eligible universe, `{SYMBOL: lotSize}` — the one filter
 * every `/tools` page that suggests or plots individual stocks must apply
 * before showing one: cash-market-only names never qualify. Shared rather
 * than each tool keeping its own client/cache, now that `picks.ts` is no
 * longer the only consumer.
 */
let client: NSEClient | null = null;
function nse(): NSEClient {
  client ??= new NSEClient(os.tmpdir(), { server: true, timeout: 15_000 });
  return client;
}

interface CacheEntry {
  at: number;
  value: Record<string, number>;
}
let cache: CacheEntry | null = null;
const TTL_MS = 60 * 60_000;

export async function fetchFnoLots(): Promise<Record<string, number>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = await nse().options.getFnoLots();
  cache = { at: Date.now(), value };
  return value;
}
