import type { ScripMaster } from "./scripMaster";
import type { TickStore } from "@/lib/stream/ticks";
import type { NseOptionChainResponse } from "@/lib/types";

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
