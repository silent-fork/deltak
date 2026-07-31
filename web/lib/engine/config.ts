/**
 * Delta-K strategy configuration — the TypeScript twin of `backend/app/config.py`.
 *
 * In the serverless build the engine runs *in the browser*, so these are plain
 * constants rather than environment settings. Anything an operator should be
 * able to change at runtime lives in `EngineConfig` and is threaded through the
 * engine hook.
 */

/**
 * Angel One publishes the contract master here. `DK_SCRIP_MASTER_URL` overrides
 * it, which lets you point at a mirror (the upstream file is ~40 MB and is
 * occasionally slow) or at a fixture in tests.
 */
export const SCRIP_MASTER_URL =
  process.env.DK_SCRIP_MASTER_URL ||
  "https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json";
export const SMART_STREAM_URL = "wss://smartapisocket.angelone.in/smart-stream";

export interface IndexSpec {
  label: string;
  /** Scrip-master `name` values that identify the index spot in NSE_CM. */
  spotAliases: string[];
  spotTokenFallback: string;
  strikeStep: number;
  lotSize: number;
}

export const INDEX_UNIVERSE: Record<string, IndexSpec> = {
  NIFTY: {
    label: "NIFTY 50",
    spotAliases: ["nifty 50", "nifty"],
    spotTokenFallback: "99926000",
    strikeStep: 50,
    lotSize: 75,
  },
  BANKNIFTY: {
    label: "BANK NIFTY",
    spotAliases: ["nifty bank", "banknifty"],
    spotTokenFallback: "99926009",
    strikeStep: 100,
    lotSize: 15,
  },
  FINNIFTY: {
    label: "FIN NIFTY",
    spotAliases: ["nifty fin service", "finnifty"],
    spotTokenFallback: "99926037",
    strikeStep: 50,
    lotSize: 40,
  },
};

export const UNDERLYINGS = Object.keys(INDEX_UNIVERSE);

/** SmartStream exchange type codes. */
export const EXCHANGE_NSE_CM = 1;
export const EXCHANGE_NSE_FO = 2;

export interface EngineConfig {
  /** Strikes either side of ATM retained in the 4-quadrant matrix. */
  chainDepth: number;
  /** ITM depth allowed for long entries — the Zero-OTM rule. */
  minItmDepth: number;
  maxItmDepth: number;
  /** Rolling window (ticks) for the RRG relative-strength mean. */
  rrgWindow: number;
  rrgMomentumLookback: number;
  rrgTailLength: number;
  /** Strikes either side of ATM plotted as active RRG nodes. */
  rrgNodeSpan: number;
  /** Strike-level shift (in strike steps) that counts as a level "moving". */
  levelShiftTolerance: number;

  riskPct: number;
  /** Stop distance as a fraction of option premium. */
  defaultStopPct: number;
  maxConcurrentPositions: number;
  /** Index break invalidation threshold, percent. */
  invalidationPct: number;

  paperCapital: number;
  slippagePct: number;
  costPerOrder: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
  chainDepth: 12,
  minItmDepth: 2,
  maxItmDepth: 3,
  rrgWindow: 40,
  rrgMomentumLookback: 5,
  rrgTailLength: 12,
  rrgNodeSpan: 6,
  levelShiftTolerance: 1,

  riskPct: 1.0,
  defaultStopPct: 0.25,
  maxConcurrentPositions: 4,
  invalidationPct: 0.35,

  paperCapital: 25_000,
  slippagePct: 0.0015,
  costPerOrder: 25,
};

/* ------------------------------------------------------------------ clock */

/**
 * IST wall-clock parts for an instant, computed without assuming the viewer's
 * timezone — a HUD whose 3:15 PM protocol depended on the browser's locale
 * would fire at the wrong moment for anyone outside India.
 */
export function istParts(at: Date = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(at).map((p) => [p.type, p.value]),
  );
  return {
    weekday: parts.weekday as string,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    date: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export const MARKET_OPEN_MIN = 9 * 60 + 15;
export const MARKET_CLOSE_MIN = 15 * 60 + 30;
export const DAYLIGHT_REST_MIN = 15 * 60 + 15;

export function istMinutes(at: Date = new Date()): number {
  const p = istParts(at);
  return p.hour * 60 + p.minute;
}

export function isWeekend(at: Date = new Date()): boolean {
  const wd = istParts(at).weekday;
  return wd === "Sat" || wd === "Sun";
}

export function isMarketOpen(at: Date = new Date()): boolean {
  if (isWeekend(at)) return false;
  const m = istMinutes(at);
  return m >= MARKET_OPEN_MIN && m <= MARKET_CLOSE_MIN;
}

/** Seconds until the 3:15 PM IST Daylight Rest Protocol (0 once elapsed). */
export function secondsToDaylightRest(at: Date = new Date()): number {
  const p = istParts(at);
  const nowSec = p.hour * 3600 + p.minute * 60 + p.second;
  const target = DAYLIGHT_REST_MIN * 60;
  return nowSec >= target ? 0 : target - nowSec;
}
