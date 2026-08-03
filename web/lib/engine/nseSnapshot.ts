import type { ScripMaster } from "./scripMaster";
import type { TickStore } from "@/lib/stream/ticks";
import type {
  Candle,
  MarketSnapshotPayload,
  NseOptionChainResponse,
  NseOptionLeg,
  OptionChain,
  SessionStats,
} from "@/lib/types";
import type { OiBuildupType } from "@/lib/market/constants";

/**
 * Fold NSE's own option-chain snapshot into the tick store — a second,
 * independent closed-market source, strictly additive.
 *
 * Every leg only ever fills a token that has no real OI yet: whichever
 * source got there first (a genuine print before the tab was left open
 * overnight, Angel One's own closed-market replay, or this) is left alone.
 * That is also what makes the market reopening safe without any explicit
 * hand-off — `TickStore.apply` (the live-tick path) always takes priority
 * over `seedQuote` the instant a real print arrives, carrying a field
 * forward only when the new tick omits it, never when this or any other
 * seed already set it. This function does not need to know whether the
 * market is open; the caller (`useMarketData`'s NSE effect) already gates
 * on that before it ever runs.
 */
export function applyNseSnapshot(
  ticks: TickStore,
  master: ScripMaster,
  underlying: string,
  snapshot: NseOptionChainResponse,
): void {
  for (const leg of snapshot.legs) {
    const inst = master.find(underlying, leg.strike, leg.side);
    if (!inst) continue;
    const existing = ticks.get(inst.token);
    if (existing && existing.oi > 0) continue;
    ticks.seedQuote(inst.token, { oi: leg.oi, volume: leg.volume, ltp: leg.ltp });
  }

  const spotToken = master.spotToken(underlying);
  const existingSpot = spotToken ? ticks.get(spotToken) : undefined;
  if (spotToken && snapshot.spot > 0 && (!existingSpot || existingSpot.ltp <= 0)) {
    ticks.seedQuote(spotToken, { ltp: snapshot.spot });
  }
}

/**
 * The other direction: whatever a chain and its market context currently
 * hold, flattened into the shape `market_snapshots` stores and
 * `applyNseSnapshot` already knows how to fold back in on the next login.
 * Source-agnostic on purpose — a leg here may be a genuine print, an Angel
 * One replay, or something this same fold already seeded from a previous
 * snapshot; whatever is in the chain right now is "available", which is
 * all this claims to capture.
 *
 * Legs with neither a real OI nor a real print are dropped rather than
 * persisted as a wall of zeros — an untraded strike has nothing "available"
 * to save.
 */
export function buildMarketSnapshotPayload(
  chain: OptionChain,
  market: {
    candles: Candle[];
    stats: SessionStats | null;
    pcr: number | null;
    buildup: OiBuildupType | null;
  },
): MarketSnapshotPayload {
  const legs: NseOptionLeg[] = [];
  for (const row of chain.rows) {
    if (row.call && (row.call.oi > 0 || row.call.ltp > 0)) {
      legs.push({
        strike: row.strike,
        side: "CE",
        oi: row.call.oi,
        changeInOi: row.call.oi_change,
        volume: row.call.volume,
        ltp: row.call.ltp,
      });
    }
    if (row.put && (row.put.oi > 0 || row.put.ltp > 0)) {
      legs.push({
        strike: row.strike,
        side: "PE",
        oi: row.put.oi,
        changeInOi: row.put.oi_change,
        volume: row.put.volume,
        ltp: row.put.ltp,
      });
    }
  }

  return {
    spot: chain.spot,
    stats: market.stats,
    candles: market.candles,
    legs,
    pcr: market.pcr,
    buildup: market.buildup,
  };
}
