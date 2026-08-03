import "server-only";

import os from "node:os";

import { NSEClient } from "nse-bse-api";

import type { BlockDeal } from "./corporateCalendarTypes";

export type { BlockDeal } from "./corporateCalendarTypes";

/**
 * Today's block deals — `market.getBlockDeals()`. `market.getBulkDeals()`
 * (the same endpoint's bulk-deal sibling) 404'd outright when probed live
 * this session, so this ships with block deals only rather than the wider
 * "bulk & block" scope originally sketched — real data beats a wider claim
 * resting on a dead endpoint.
 */

let client: NSEClient | null = null;
function nse(): NSEClient {
  client ??= new NSEClient(os.tmpdir(), { server: true, timeout: 15_000 });
  return client;
}

interface CacheEntry {
  at: number;
  value: BlockDeal[];
}
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 15 * 60_000;

export async function getBlockDeals(): Promise<BlockDeal[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  try {
    const res = (await nse().market.getBlockDeals()) as {
      data?: {
        symbol?: string;
        series?: string;
        lastPrice?: number;
        pchange?: number;
        totalTradedVolume?: number;
        totalTradedValue?: number;
        lastUpdateTime?: string;
      }[];
    };
    const value: BlockDeal[] = (res.data ?? [])
      .filter((r) => r.symbol)
      .map((r) => ({
        symbol: r.symbol!,
        series: r.series ?? "",
        price: r.lastPrice ?? 0,
        changePct: r.pchange ?? 0,
        volume: r.totalTradedVolume ?? 0,
        value: r.totalTradedValue ?? 0,
        time: r.lastUpdateTime ?? "",
      }));
    cache = { at: Date.now(), value };
    return value;
  } catch {
    cache = { at: Date.now(), value: [] };
    return [];
  }
}
