import "server-only";

import { fetchOptionChainSnapshot } from "@/lib/server/nse";
import type { IndexOptionMetrics, StrikeOi } from "./volatilityDeskTypes";

export type { IndexOptionMetrics, StrikeOi } from "./volatilityDeskTypes";

/**
 * PCR and max pain for one index — both derived from NSE's own option-chain
 * snapshot (`fetchOptionChainSnapshot`, already wrapped in `lib/server/nse.ts`
 * for the closed-market gap-filler), never Angel One.
 *
 * Max pain: the strike at which option *writers* collectively owe the least
 * — for each candidate settlement price, sum every call strike below it
 * (writer owes (settle − strike) × OI) and every put strike above it
 * (writer owes (strike − settle) × OI); the candidate that minimises that
 * total is max pain. O(n²) over the strikes on a single chain (a few dozen
 * near the money), trivial at this scale.
 */
const INDICES: { underlying: string; label: string }[] = [
  { underlying: "NIFTY", label: "NIFTY" },
  { underlying: "BANKNIFTY", label: "BANKNIFTY" },
  { underlying: "FINNIFTY", label: "FINNIFTY" },
];

async function getOneIndexMetrics(
  underlying: string,
  label: string,
): Promise<IndexOptionMetrics | null> {
  try {
    const chain = await fetchOptionChainSnapshot(underlying);
    if (chain.legs.length === 0) return null;

    const byStrike = new Map<number, { call: number; put: number }>();
    let totalCallOi = 0;
    let totalPutOi = 0;
    for (const leg of chain.legs) {
      const entry = byStrike.get(leg.strike) ?? { call: 0, put: 0 };
      if (leg.side === "CE") {
        entry.call += leg.oi;
        totalCallOi += leg.oi;
      } else {
        entry.put += leg.oi;
        totalPutOi += leg.oi;
      }
      byStrike.set(leg.strike, entry);
    }
    if (byStrike.size === 0) return null;

    const strikes: StrikeOi[] = Array.from(byStrike.entries())
      .map(([strike, { call, put }]) => ({ strike, oi: call + put, call, put }))
      .sort((a, b) => a.strike - b.strike);

    let maxPainStrike: number | null = null;
    let minPain = Infinity;
    for (const candidate of strikes) {
      let pain = 0;
      for (const s of strikes) {
        if (candidate.strike > s.strike) pain += (candidate.strike - s.strike) * s.call;
        if (candidate.strike < s.strike) pain += (s.strike - candidate.strike) * s.put;
      }
      if (pain < minPain) {
        minPain = pain;
        maxPainStrike = candidate.strike;
      }
    }

    return {
      underlying,
      label,
      spot: chain.spot,
      pcr: totalCallOi > 0 ? totalPutOi / totalCallOi : 0,
      maxPainStrike,
      strikes,
    };
  } catch {
    return null;
  }
}

interface CacheEntry {
  at: number;
  value: IndexOptionMetrics[];
}
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 10 * 60_000;

/**
 * Sequential, not `Promise.all` — this hits the same live nseindia.com
 * option-chain endpoint three times in a row; the equivalent live per-symbol
 * quote endpoint measurably degraded under concurrent load elsewhere in
 * this app (see `marketScanner.ts`), so the same caution applies here even
 * though this specific endpoint hasn't shown that failure directly.
 */
export async function getAllIndexOptionMetrics(): Promise<IndexOptionMetrics[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  const value: IndexOptionMetrics[] = [];
  for (const { underlying, label } of INDICES) {
    const metrics = await getOneIndexMetrics(underlying, label);
    if (metrics) value.push(metrics);
  }

  cache = { at: Date.now(), value };
  return value;
}
