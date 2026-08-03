/** Client-safe types for `/api/tools/volatility-desk` — server-only fetch logic lives in `oiBuildup.ts`, `optionMetrics.ts` and `vix.ts`. */

export type OiQuadrant = "LONG_BUILDUP" | "SHORT_BUILDUP" | "LONG_UNWINDING" | "SHORT_COVERING";

export interface OiBuildupStock {
  symbol: string;
  priceChangePct: number;
  oiChangePct: number;
  /** Near-month open interest, in shares. */
  oi: number;
  quadrant: OiQuadrant;
}

export interface StrikeOi {
  strike: number;
  oi: number;
  call: number;
  put: number;
}

export interface IndexOptionMetrics {
  underlying: string;
  label: string;
  spot: number;
  pcr: number;
  maxPainStrike: number | null;
  strikes: StrikeOi[];
}

export type VixRegime = "Calm" | "Normal" | "Elevated" | "Panic";

export interface VixReading {
  value: number;
  changePct: number;
  asOf: string;
  regime: VixRegime;
}

export interface VolatilityDeskResponse {
  asOf: string;
  oiBuildup: OiBuildupStock[];
  indices: IndexOptionMetrics[];
  vix: VixReading | null;
}
