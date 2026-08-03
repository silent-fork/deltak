/** Client-safe types for `/api/tools/market-scanner` — see `marketScanner.ts` for the server-only fetch logic. */

export interface HeatmapTile {
  symbol: string;
  changePct: number;
  turnover: number;
  fno: boolean;
}

export interface HeatmapSector {
  label: string;
  changePct: number;
  weight: number;
  tiles: HeatmapTile[];
}

/** One stock's position within its rolling ~20-session high/low range — see `marketScanner.ts`. */
export interface RadarStock {
  symbol: string;
  low: number;
  high: number;
  last: number;
  /** 0 = at the window low, 1 = at the window high. */
  position: number;
}

export interface MarketScannerResponse {
  asOf: string;
  sectors: HeatmapSector[];
  radar: RadarStock[];
}
