/**
 * DeltaK strategy configuration — the TypeScript twin of `backend/app/config.py`.
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
  /** Which cash/F&O pair this index's spot and options actually list on. */
  exchange: "NSE" | "BSE";
  /**
   * Scrip-master `name`/`symbol` values that identify the index spot on its
   * cash segment. Matched case- and whitespace-insensitively (see
   * `normalizeSpotAlias` in `/api/master`), so this only needs to cover real
   * *wording* variants, not casing or double-spacing.
   */
  spotAliases: string[];
  spotTokenFallback: string;
  strikeStep: number;
  lotSize: number;
  /**
   * Override for `RrgEngine`'s default genuine-price-change threshold
   * (`MIN_SAMPLES` in `lib/engine/rrg.ts`). Omit to use that default.
   * FINNIFTY's real intraday option liquidity is thin enough that a premium
   * can go many ticks without a genuine change, so the default threshold
   * rarely gets satisfied and the RRG chart sits empty all session even
   * though nothing is actually broken — this lets a thinner instrument
   * mature its nodes sooner without changing the bar for every underlying.
   */
  rrgMinSamples?: number;
  /**
   * Overrides for `EngineConfig.rrgWindow`/`rrgMomentumLookback`. Omit to use
   * the shared default. A thinner instrument's genuine price changes are
   * sparser *and* noisier relative to signal than a liquid one's — averaging
   * RS-Ratio/RS-Momentum over more of them (not just waiting for fewer of
   * them, which `rrgMinSamples` already does) keeps its quadrant read stable
   * rather than flickering, which matters because a LAGGING read bans entry
   * outright under DKMS.
   */
  rrgWindow?: number;
  rrgMomentumLookback?: number;
  /**
   * Override for `RrgScatter`'s "still maturing" bar (`RRG_READY_FRACTION`,
   * the fraction of expected nodes that must have matured before the plot
   * stops calling itself unfinished). Omit to use that default. A thinner
   * instrument's far strikes may go a whole session without a genuine print
   * at all, so waiting for the same 90% every liquid index clears in a
   * minute would leave the plot marked "maturing" for the rest of the day
   * even once enough of it is real to read.
   */
  rrgReadyFraction?: number;
}

export const INDEX_UNIVERSE: Record<string, IndexSpec> = {
  NIFTY: {
    label: "NIFTY 50",
    exchange: "NSE",
    spotAliases: ["nifty 50", "nifty"],
    spotTokenFallback: "99926000",
    strikeStep: 50,
    lotSize: 75,
  },
  BANKNIFTY: {
    label: "BANK NIFTY",
    exchange: "NSE",
    spotAliases: ["nifty bank", "banknifty"],
    spotTokenFallback: "99926009",
    strikeStep: 100,
    lotSize: 15,
  },
  FINNIFTY: {
    label: "FIN NIFTY",
    exchange: "NSE",
    // Widened past the single "nifty fin service" guess this shipped with —
    // NSE's own long-form index name, the derivative's own ticker, and a
    // no-space variant some feeds use, all normalized the same way at match
    // time (see normalizeSpotAlias in /api/master). If the spot still
    // doesn't resolve from a live master under all of these, the fallback
    // token below is what's carrying it, not a name match — and a failed
    // match now logs which underlying and which aliases were checked.
    spotAliases: [
      "nifty fin service",
      "nifty financial services",
      "niftyfinservice",
      "finnifty",
    ],
    spotTokenFallback: "99926037",
    strikeStep: 50,
    lotSize: 40,
    // Roughly half the default 8 — thin enough real liquidity that waiting
    // for 8 genuine ticks routinely never happens in a session, but 4 is
    // still enough to damp out a couple of noisy opening prints.
    rrgMinSamples: 4,
    // Wider than the shared 90/15 default for the same reason: each of
    // FINNIFTY's sparser genuine changes carries proportionally more noise,
    // so the trend mean and momentum comparison both read over more of them.
    rrgWindow: 150,
    rrgMomentumLookback: 25,
    // A quarter of its legs matured is enough to read the rotation on an
    // instrument this thin — the far OTM strikes in a 26-leg span routinely
    // never print at all, and holding the plot "maturing" until 90% of them
    // somehow do would mean it almost never clears.
    rrgReadyFraction: 0.25,
  },
  // BANKEX and SENSEX list on BSE's own cash/F&O segments, not NSE's — spot
  // tokens, strike step and lot size below were confirmed directly against a
  // live scrip master fetch (146,573-instrument file, checked 2026-08-03):
  // both carry real, currently-listed BFO/OPTIDX chains (BANKEX 1,004
  // contracts across 3 monthly expiries; SENSEX 3,204 across 20 — SENSEX
  // runs a weekly cadence, BANKEX monthly-only), not just a spot ticker with
  // nothing behind it.
  BANKEX: {
    label: "BANKEX",
    exchange: "BSE",
    spotAliases: ["bankex", "bse bankex", "s&p bse bankex"],
    // The BSE cash segment carries two BANKEX rows — a modern AMXIDX-tagged
    // one and a legacy duplicate with no instrumenttype at all (NIFTY has
    // the identical pair on NSE, e.g. 99926000 vs the legacy 26000). This is
    // the AMXIDX one, independently confirmed live rather than guessed.
    spotTokenFallback: "99919012",
    strikeStep: 100,
    lotSize: 30,
  },
  SENSEX: {
    label: "SENSEX",
    exchange: "BSE",
    spotAliases: ["sensex", "bse sensex", "s&p bse sensex"],
    spotTokenFallback: "99919000",
    strikeStep: 100,
    lotSize: 20,
  },
};

export const UNDERLYINGS = Object.keys(INDEX_UNIVERSE);

/**
 * The historical-API F&O segment matching an index's own cash exchange —
 * NSE trades index options on NFO, BSE on BFO. Every per-contract historical
 * call (session seeding, wall OI curves, closed-market replay) needs this,
 * not just the spot candle fetches that already read `IndexSpec.exchange`
 * directly.
 */
export function optionExchange(underlying: string): "NFO" | "BFO" {
  return INDEX_UNIVERSE[underlying]?.exchange === "BSE" ? "BFO" : "NFO";
}

/** SmartStream exchange type codes — Angel One's WebSocket 2.0 enum, not the REST API's string segment names below. */
export const EXCHANGE_NSE_CM = 1;
export const EXCHANGE_NSE_FO = 2;
export const EXCHANGE_BSE_CM = 3;
export const EXCHANGE_BSE_FO = 4;

export interface EngineConfig {
  /** Strikes either side of ATM retained in the 4-quadrant matrix. */
  chainDepth: number;
  /** ITM depth allowed for long entries — the Zero-OTM rule. */
  minItmDepth: number;
  maxItmDepth: number;
  /** Rolling window (engine ticks) for the RRG relative-strength mean. */
  rrgWindow: number;
  /** How many ticks back RS-Momentum compares against — larger reads slower and smoother. */
  rrgMomentumLookback: number;
  rrgTailLength: number;
  /** Strikes either side of ATM plotted as active RRG nodes. */
  rrgNodeSpan: number;
  /**
   * Strikes either side of ATM whose session-open OI is fetched from the
   * historical API. Every strike costs one metered request, so this is
   * deliberately tighter than the rendered chain: the walls and everything the
   * driver can actually trade sit inside it.
   */
  oiSeedSpan: number;
  /** Strike-level shift (in strike steps) that counts as a level "moving". */
  levelShiftTolerance: number;
  /**
   * Samples looked back over when measuring a wall's shift — recent, not the
   * whole trail. A first-vs-last comparison over the entire buffer lets a
   * noisy early-session print anchor "solid vs migrating" long after it has
   * aged out of relevance; this bounds the comparison to a recent window.
   */
  shiftLookback: number;

  riskPct: number;
  /**
   * Stop distance as a fraction of option premium, per protocol — Alpha's
   * range trade at a wall behaves differently from Beta/Gamma's momentum
   * entries, so each gets its own knob rather than one number shared
   * across all three. Protocol Delta never reaches this: it's blocked
   * before any risk geometry is computed (see `SignalEngine.evaluate`).
   * Also doubles as the "1R" reference for the trailing-stop guards
   * (`decideTrail`) — a position's own stored `protocol` is enough to
   * reconstruct roughly how far its stop started out, without needing a
   * separately persisted risk-distance field.
   */
  stopPctByProtocol: Record<"ALPHA" | "BETA" | "GAMMA", number>;
  /**
   * Rough delta approximation for a 2nd/3rd-ITM long — the Zero-OTM rule's
   * own strike band. Used only to translate a COA wall's distance in
   * underlying points into an approximate option-premium distance for
   * Alpha's wall-anchored target; this is an approximation; the engine has
   * no live delta from either broker's option chain today.
   */
  itmDeltaApprox: number;
  maxConcurrentPositions: number;
  /** Index break invalidation threshold, percent. */
  invalidationPct: number;
  /**
   * Minimum adverse move in the underlying (percent of entry spot) required
   * before a Weakening-quadrant rotation triggers the TP1 scale-out. A deep-ITM
   * long's premium can drift into Weakening from theta bleed alone on a flat
   * tape; this keeps that guard reacting to genuine rotation, not the clock.
   */
  weakeningMinAdverseMovePct: number;
  /**
   * Hard ceiling on one position's premium spend, percent of equity —
   * independent of the risk-% sizing math. Without it, a generous risk% on a
   * cheaply-stopped contract can size up to "spend nearly all deployable
   * capital" while still reading as a bounded-risk trade.
   */
  maxPositionCapitalPct: number;
  /**
   * Aggregate at-risk-at-stop ceiling across every open position, percent of
   * equity. Bounds correlated exposure (e.g. simultaneous NIFTY/BANKNIFTY/
   * FINNIFTY longs) without needing to model the correlation itself: it caps
   * the total loss-at-stop the book can carry at once.
   */
  maxPortfolioRiskPct: number;
  /**
   * Divergence between the rendered chain's own PCR and the market-wide
   * cumulative PCR, percent, beyond which a signal is held rather than fired —
   * a wide gap means the window's PCR reflects a couple of nearby strikes, not
   * broad positioning.
   */
  pcrDivergencePct: number;

  paperCapital: number;
  slippagePct: number;
  costPerOrder: number;
}

export const DEFAULT_CONFIG: EngineConfig = {
  chainDepth: 12,
  minItmDepth: 2,
  maxItmDepth: 3,
  // Widened from 40/5 — at the old settings a single noisy tick could swing
  // a node's RS-Ratio/RS-Momentum enough to visibly jump across quadrants
  // inside a few seconds. A longer mean window and momentum lookback both
  // read over more of the session, so nodes drift the way a rotation
  // actually develops rather than jittering tick to tick.
  rrgWindow: 90,
  rrgMomentumLookback: 15,
  rrgTailLength: 12,
  rrgNodeSpan: 6,
  oiSeedSpan: 5,
  levelShiftTolerance: 1,
  shiftLookback: 20,

  /**
   * Sized for the 25,000 paper float: at 1% the risk budget (250) is smaller
   * than a single NIFTY lot's stop distance, so every signal resolved to zero
   * lots and nothing could ever be placed. The premium-affordability cap in
   * `calculateSize` remains the real backstop.
   */
  riskPct: 30.0,
  // Same 25% every protocol used before this was split out — no behaviour
  // change until one of these is tuned independently.
  stopPctByProtocol: { ALPHA: 0.25, BETA: 0.25, GAMMA: 0.25 },
  itmDeltaApprox: 0.7,
  maxConcurrentPositions: 4,
  invalidationPct: 0.35,
  weakeningMinAdverseMovePct: 0.05,
  maxPositionCapitalPct: 40,
  maxPortfolioRiskPct: 60,
  pcrDivergencePct: 40,

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
/**
 * 3:40 PM IST — NSE's F&O close, extended 10 minutes from 3:30 PM effective
 * 3 Aug 2026 to align with the cash market's new Closing Auction Session
 * (continuous trading to 3:15 PM, CAS 3:15–3:35 PM, F&O itself continues to
 * 3:40 PM). Non-F&O cash equities are unaffected and still close at 3:30 PM,
 * but this app only ever trades F&O.
 */
export const MARKET_CLOSE_MIN = 15 * 60 + 40;
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

/**
 * Seconds until the next 9:15 AM IST bell.
 *
 * Weekends are skipped by probing forward a day at a time and asking the IST
 * clock what day it landed on — IST has no daylight saving, so adding whole
 * days holds the wall clock steady. Exchange holidays are *not* known here
 * (that would need a calendar the terminal does not carry), so a Muhurat-style
 * closure will read as an open that never comes.
 */
export function secondsToNextOpen(at: Date = new Date()): number {
  const p = istParts(at);
  const nowSec = p.hour * 3600 + p.minute * 60 + p.second;
  const openSec = MARKET_OPEN_MIN * 60;

  for (let offset = 0; offset <= 7; offset++) {
    const probe = offset === 0 ? at : new Date(at.getTime() + offset * 86_400_000);
    const weekday = istParts(probe).weekday;
    if (weekday === "Sat" || weekday === "Sun") continue;
    // Today only counts while its bell is still ahead.
    if (offset === 0 && nowSec >= openSec) continue;
    return offset * 86_400 + openSec - nowSec;
  }
  return 0;
}

/**
 * The midnight IST that ends `at`'s IST calendar day — SmartAPI sessions
 * expire then, whatever time within the day they were issued.
 *
 * IST is UTC+5:30 with no daylight saving, so "midnight IST of calendar date
 * Y-M-D" is always exactly `Y-M-D 18:30` UTC the day before. `istParts` gives
 * the IST calendar date for *any* instant during that day, so this is always
 * the boundary still ahead of `at` — never a stale one already passed.
 */
export function nextMidnightIst(at: Date = new Date()): Date {
  const p = istParts(at);
  const [y, m, d] = p.date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 18, 30, 0));
}
