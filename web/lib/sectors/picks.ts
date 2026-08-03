import "server-only";

import os from "node:os";

import { NSEClient } from "nse-bse-api";

import { fetchConstituents } from "./constituents";
import { fetchLatestEquityCloses } from "./equityBhavcopy";
import type { SectorPick, SectorRotationPoint } from "./types";

export type { SectorPick } from "./types";

/**
 * Top F&O-eligible movers inside a leading sector — the user's own
 * constraint, verbatim: "stock with fno available only to be suggested".
 * `getFnoLots()` is the authoritative F&O-eligibility list (its keys are
 * exactly the underlyings NSE runs futures/options on); a sector's
 * constituent list is intersected against it before anything is ranked, so
 * a stock that is only in the cash market never reaches the output.
 *
 * Ranked off the bulk equity bhavcopy (`equityBhavcopy.ts`), not a per-stock
 * live call — see that file for why: the live per-symbol endpoint 403'd
 * outright under real use.
 */

let client: NSEClient | null = null;
function nse(): NSEClient {
  client ??= new NSEClient(os.tmpdir(), { server: true, timeout: 15_000 });
  return client;
}

interface FnoCacheEntry {
  at: number;
  value: Record<string, number>;
}
let fnoCache: FnoCacheEntry | null = null;
const FNO_TTL_MS = 60 * 60_000;

async function fnoLots(): Promise<Record<string, number>> {
  if (fnoCache && Date.now() - fnoCache.at < FNO_TTL_MS) return fnoCache.value;
  const value = await nse().options.getFnoLots();
  fnoCache = { at: Date.now(), value };
  return value;
}

/**
 * Top 3 F&O-eligible movers (by the latest session's own change%) inside one
 * sector. Empty when the sector has no known constituent list
 * (`constituentSlug: null` in `config.ts`) — there is nothing to rank.
 *
 * Never throws: `fetchConstituents` is a live, unauthenticated call to
 * niftyindices.com with the same no-SLA reliability problems documented
 * throughout `lib/sectors/*` (confirmed live — it 404'd outright mid-session
 * here), and one sector's flaky fetch taking down the whole dashboard
 * response (RRG plot included) over a picks list is a strictly worse
 * failure than that one sector just showing no picks.
 */
export async function topPicksForSector(sector: SectorRotationPoint): Promise<SectorPick[]> {
  if (!sector.constituentSlug) return [];

  try {
    const [constituents, lots, closes] = await Promise.all([
      fetchConstituents(sector.constituentSlug),
      fnoLots(),
      fetchLatestEquityCloses(),
    ]);

    const ranked = constituents
      .filter((c) => c.symbol in lots)
      .map((c) => ({ c, close: closes.get(c.symbol) }))
      .filter(
        (x): x is { c: (typeof constituents)[number]; close: NonNullable<typeof x.close> } =>
          x.close !== undefined,
      )
      .sort((a, b) => b.close.changePct - a.close.changePct)
      .slice(0, 3);

    return ranked.map(({ c, close }) => ({
      symbol: c.symbol,
      company: c.company,
      lastClose: close.close,
      changePct: close.changePct,
      lotSize: lots[c.symbol]!,
    }));
  } catch {
    return [];
  }
}

async function pooledMap<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

/** Top picks for the leading sectors only — the dashboard's actual ask. */
export async function topPicksForLeadingSectors(
  sectors: SectorRotationPoint[],
  maxSectors = 3,
): Promise<{ sector: SectorRotationPoint; picks: SectorPick[] }[]> {
  const leading = sectors.filter((s) => s.quadrant === "LEADING").slice(0, maxSectors);
  const results = await pooledMap(leading, 2, async (sector) => ({
    sector,
    picks: await topPicksForSector(sector),
  }));
  return results;
}
