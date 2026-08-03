import "server-only";

import { pooledMap } from "@/lib/server/pool";
import { SECTORS } from "@/lib/sectors/config";
import { fetchConstituents } from "@/lib/sectors/constituents";
import {
  fetchEquityRangesForDate,
  fetchLatestEquityCloses,
} from "@/lib/sectors/equityBhavcopy";
import { fetchFnoLots } from "@/lib/sectors/fnoLots";
import type { HeatmapSector, HeatmapTile, RadarStock } from "./marketScannerTypes";

export type { HeatmapSector, HeatmapTile, RadarStock } from "./marketScannerTypes";

/* ------------------------------------------------------------- heatmap */

/**
 * Every sector with a known constituent list (`constituentSlug` in
 * `lib/sectors/config.ts`), each stock's day change% and turnover read off
 * the same bulk equity bhavcopy the sector-rotation picks already use.
 * Sized by turnover rather than market cap — there is no bulk market-cap
 * source in `nse-bse-api`, and turnover is arguably the more honest "how
 * much is actually happening here" weight for a heatmap anyway.
 */
export async function getSectorHeatmap(): Promise<HeatmapSector[]> {
  const [closes, lots] = await Promise.all([fetchLatestEquityCloses(), fetchFnoLots()]);
  const withSlug = SECTORS.filter((s) => s.constituentSlug);

  const results = await pooledMap(withSlug, 4, async (sector): Promise<HeatmapSector | null> => {
    try {
      const constituents = await fetchConstituents(sector.constituentSlug!);
      const tiles: HeatmapTile[] = [];
      let turnoverSum = 0;
      let weightedChangeSum = 0;

      for (const c of constituents) {
        const eq = closes.get(c.symbol);
        if (!eq) continue;
        tiles.push({
          symbol: c.symbol,
          changePct: eq.changePct,
          turnover: eq.turnover,
          fno: c.symbol in lots,
        });
        turnoverSum += eq.turnover;
        weightedChangeSum += eq.changePct * eq.turnover;
      }
      if (tiles.length === 0) return null;

      tiles.sort((a, b) => b.turnover - a.turnover);
      return {
        label: sector.label,
        changePct:
          turnoverSum > 0
            ? weightedChangeSum / turnoverSum
            : tiles.reduce((a, t) => a + t.changePct, 0) / tiles.length,
        weight: turnoverSum,
        tiles,
      };
    } catch {
      // One sector's constituent fetch failing (niftyindices.com has no
      // SLA — see lib/sectors/picks.ts) drops that block, not the map.
      return null;
    }
  });

  return results.filter((r): r is HeatmapSector => r !== null);
}

/* --------------------------------------------------------------- range radar */

/**
 * A genuine 52-week figure lives only behind NSE's live per-symbol quote
 * endpoint (`historical.fetchEquityHistoricalData`'s `ch52WeekHighPrice`/
 * `ch52WeekLowPrice` fields) — and that endpoint proved too unreliable to
 * build a real feature on, confirmed live going from 5/5 successful calls
 * to 0/20 failed within the same session (the exact "unpredictably blocked
 * even within the same run" pattern documented throughout `lib/sectors/*`).
 *
 * This rebuilds the same idea — "how close is this stock to its recent
 * extreme" — from the one source that has been rock solid all session: the
 * bulk equity bhavcopy, walked back day by day the same way
 * `rotation.ts`'s sector backfill already does, taking the rolling max
 * high / min low across the window instead of NSE's own 52-week figure.
 * Shorter than a true 52 weeks, but real and reliable beats a wider window
 * that is down as often as not.
 */
const RANGE_WINDOW_TRADING_DAYS = 20;
const RANGE_BACKFILL_CALENDAR_DAYS = 32;
const RANGE_FETCH_CONCURRENCY = 4;

interface RadarCacheEntry {
  at: number;
  value: RadarStock[];
}
let radarCache: RadarCacheEntry | null = null;
const RADAR_TTL_MS = 45 * 60_000;

export async function getRangeRadar(): Promise<RadarStock[]> {
  if (radarCache && Date.now() - radarCache.at < RADAR_TTL_MS) return radarCache.value;

  const today = new Date();
  const jobs = Array.from({ length: RANGE_BACKFILL_CALENDAR_DAYS }, (_, i) => {
    const d = new Date(today);
    d.setDate(d.getDate() - (i + 1)); // start from yesterday — today's bhavcopy isn't out mid-session
    return () => fetchEquityRangesForDate(d);
  });

  const days = (await pooledMap(jobs, RANGE_FETCH_CONCURRENCY, (job) => job())).filter(
    (d): d is NonNullable<typeof d> => d !== null,
  );
  const window = days.slice(0, RANGE_WINDOW_TRADING_DAYS);

  const high = new Map<string, number>();
  const low = new Map<string, number>();
  for (const day of window) {
    for (const [symbol, range] of day) {
      high.set(symbol, Math.max(high.get(symbol) ?? range.high, range.high));
      low.set(symbol, Math.min(low.get(symbol) ?? range.low, range.low));
    }
  }

  const [closes, lots] = await Promise.all([fetchLatestEquityCloses(), fetchFnoLots()]);
  const value: RadarStock[] = [];
  for (const symbol of Object.keys(lots)) {
    const h = high.get(symbol);
    const l = low.get(symbol);
    const last = closes.get(symbol)?.close;
    if (!h || !l || h <= l || !last) continue;
    value.push({
      symbol,
      high: h,
      low: l,
      last,
      position: Math.max(0, Math.min(1, (last - l) / (h - l))),
    });
  }
  value.sort((a, b) => a.position - b.position);

  radarCache = { at: Date.now(), value };
  return value;
}
