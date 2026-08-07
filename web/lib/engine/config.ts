import type { VixRegime } from "@/lib/tools/volatilityDeskTypes";

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

  /**
   * Per-index overrides for everything else in `EngineConfig` that's a
   * genuine noise-vs-signal tradeoff rather than a portfolio/capital-
   * management knob (those — `riskPct`, `maxConcurrentPositions`,
   * `maxPositionCapitalPct`, `maxPortfolioRiskPct`, `pcrDivergencePct`,
   * `stopPctByProtocol` — stay one shared number across every underlying on
   * purpose: a single paper wallet's risk budget shouldn't read differently
   * depending on which index it's deployed against). Every field here is
   * `?? ` against the shared default in `effectiveConfig`, the same pattern
   * `rrgWindow`/`rrgMomentumLookback`/`rrgMinSamples` above already use.
   *
   * The values set below are reasoned from each index's documented
   * liquidity tier and roughly-known relative volatility (BANKNIFTY/BANKEX
   * trade a noticeably larger typical daily range than NIFTY/SENSEX;
   * FINNIFTY and BANKEX are the thinnest order books of the five, BANKEX
   * more so — monthly-only expiry vs SENSEX's weekly, see the BANKEX/SENSEX
   * comment above) — not fitted against real tick data, the same honestly-
   * approximate posture `itmDeltaApprox` already documents elsewhere in
   * this file. Phase 0's `signal_actionable_transition` analytics event
   * (see `useEngine.ts`) is what should eventually confirm or correct them
   * per index, rather than this comment's own reasoning.
   */
  invalidationPct?: number;
  alphaEntryBandPct?: number;
  microMoveMinPct?: number;
  microMoveLookbackTicks?: number;
  weakeningMinAdverseMovePct?: number;
  shiftLookback?: number;
  wallChallengeMarginPct?: number;
  earlyOiChangeFloor?: number;
  maxSpreadPct?: number;
  minChopRangePct?: number;
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
    // Liquidity matches NIFTY (no window/RRG changes needed) but the sector
    // concentration trades a noticeably wider typical daily range — bands
    // and the micro-dip/rally floor scaled up roughly in proportion so a
    // move that's genuinely noise on this index isn't read as signal just
    // because it's larger in points than NIFTY's own thresholds expect.
    invalidationPct: 0.5,
    alphaEntryBandPct: 0.2,
    microMoveMinPct: 0.07,
    weakeningMinAdverseMovePct: 0.07,
    // Spreads stay at the shared default — liquidity here really does
    // match NIFTY's — but Beta/Gamma's chop floor scales with the same
    // volatility multiplier as the bands above.
    minChopRangePct: 0.14,
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
    // Same thinness this file already treats via the RRG overrides above,
    // applied to the rest of the noise-vs-signal surface: sparser genuine
    // ticks need a longer window to read a real dip/rally/wall-shift
    // against, and a lower OI floor since this instrument's absolute open
    // interest runs smaller than NIFTY/BANKNIFTY's to begin with. Volatility
    // itself is closer to NIFTY's than BANKNIFTY's, so bands widen only
    // slightly, not in proportion to the window/floor changes.
    invalidationPct: 0.4,
    alphaEntryBandPct: 0.17,
    microMoveMinPct: 0.06,
    microMoveLookbackTicks: 30,
    weakeningMinAdverseMovePct: 0.06,
    shiftLookback: 30,
    wallChallengeMarginPct: 20,
    earlyOiChangeFloor: 400,
    // Thinner book, wider natural quotes — the spread ceiling widens with
    // it, or every setup on this instrument would veto on execution
    // quality alone regardless of how sound the underlying thesis is.
    maxSpreadPct: 6,
    minChopRangePct: 0.12,
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
    // The thinnest order book of the five (monthly-only expiry, see the
    // comment above), compounded with a sector-concentration volatility
    // similar to BANKNIFTY's — both effects widen here rather than one
    // dominating. RRG treated the same way FINNIFTY already is, for the
    // same reason: genuine price changes are sparse enough that the shared
    // 8-sample/90-window default would rarely mature within a session.
    rrgMinSamples: 4,
    rrgWindow: 160,
    rrgMomentumLookback: 28,
    rrgReadyFraction: 0.25,
    invalidationPct: 0.55,
    alphaEntryBandPct: 0.23,
    microMoveMinPct: 0.1,
    microMoveLookbackTicks: 35,
    weakeningMinAdverseMovePct: 0.08,
    shiftLookback: 35,
    wallChallengeMarginPct: 25,
    earlyOiChangeFloor: 300,
    // Thinnest book of the five, compounded with the same higher
    // sector-concentration volatility as BANKNIFTY — widest allowance on
    // both the spread ceiling and the chop floor.
    maxSpreadPct: 8,
    minChopRangePct: 0.16,
  },
  SENSEX: {
    label: "SENSEX",
    exchange: "BSE",
    spotAliases: ["sensex", "bse sensex", "s&p bse sensex"],
    spotTokenFallback: "99919000",
    strikeStep: 100,
    lotSize: 20,
    // Weekly expiry keeps this meaningfully more liquid than BANKEX's
    // monthly-only book, but still thinner than either NSE index — a
    // lighter version of the same RRG/window/floor widening, and volatility
    // close enough to NIFTY's (both track a similar large-cap universe)
    // that bands widen only for the extra execution noise, not for range.
    rrgMinSamples: 6,
    rrgWindow: 110,
    rrgMomentumLookback: 18,
    rrgReadyFraction: 0.5,
    invalidationPct: 0.4,
    alphaEntryBandPct: 0.17,
    microMoveMinPct: 0.06,
    microMoveLookbackTicks: 24,
    weakeningMinAdverseMovePct: 0.06,
    shiftLookback: 24,
    wallChallengeMarginPct: 20,
    earlyOiChangeFloor: 500,
    maxSpreadPct: 6,
    minChopRangePct: 0.12,
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
  /**
   * Phase 2 noise reduction — see `coa.ts`'s `challengeWall`. COA 2.0 picked
   * whichever strike had the single highest `oi_change` every tick, with no
   * regard for how close the runner-up was — two neighbouring strikes
   * trading the "highest fresh OI" title back and forth on ordinary fills
   * flipped the wall (and therefore the anchored stop/target and the entry
   * proximity band) a full strike step with it. A challenger must now beat
   * the incumbent wall's own current `oi_change` by this percentage margin
   * before it takes over; ties and near-ties leave the standing wall alone.
   */
  wallChallengeMarginPct: number;
  /**
   * Minimum `oi_change` (raw contracts) for a strike to be considered a real
   * COA 2.0 candidate at all — below this, `challengeWall` falls back to the
   * COA 1.0 cumulative wall, same as having no positive `oi_change` anywhere
   * yet. Early in a session (or on a thin instrument) every strike's
   * `oi_change` sits near zero relative to the noise in a single print;
   * picking an arg-max over near-zero values is close to picking at random.
   */
  earlyOiChangeFloor: number;

  /**
   * Phase 3 noise reduction — confirming filters off data the engine
   * already reads but, before this, only used to price a fill (`best_bid`/
   * `best_ask`) or not at all (the rolling spot window Beta/Gamma's
   * micro-dip/rally already builds). Both are immediate, current-tick
   * vetoes in `evaluate()`, the same posture `buildupMismatch`/
   * `pcrDivergent` already have — not dwelled through, since a wide spread
   * or a genuinely flat tape is a real fact about right now, not flicker.
   */
  /**
   * Bid-ask spread ceiling on the chosen leg, percent of mid — `(ask-bid)/
   * mid * 100`. A wide quote is a bad fill waiting to happen regardless of
   * how sound the setup is; this rejects on execution quality directly
   * rather than only ever reading `best_ask` and hoping it was tight.
   */
  maxSpreadPct: number;
  /**
   * Minimum realised range over the rolling spot window (`spotWindow`,
   * `(max-min)/mean * 100`), required before Beta/Gamma will fire — a
   * momentum entry needs the underlying to actually be moving. Alpha is
   * deliberately exempt: it is a mean-reversion play at a wall, where a
   * tight, low-range tape *is* the setup, not evidence there isn't one.
   */
  minChopRangePct: number;
  /**
   * Minutes after `MARKET_OPEN_MIN` during which no new entry fires —
   * spreads are typically at their widest, COA walls have had the fewest
   * samples to settle, and RRG nodes are furthest from maturity. Existing
   * positions are untouched; this only gates fresh entries. Not per-index:
   * the opening's own settling-in period is a market-structure effect, not
   * a liquidity-tier one. The closing side reuses `DAYLIGHT_REST_MIN`
   * directly rather than a separate constant — new entries stop exactly
   * when existing risk starts getting flattened, closing what would
   * otherwise be a 25-minute gap between the two.
   */
  openingQuietMinutes: number;

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

  /**
   * Phase 1 noise reduction — see `dkms.ts`'s `applyDwellLatch` and
   * `rollingExtremeBreak`. Every gate below `evaluate()` already had was a
   * single-tick, instantaneous read with no persistence requirement; these
   * knobs add the confirmation layer instead of changing any of the
   * existing thresholds themselves.
   */
  /**
   * Consecutive qualifying ticks (1 per second, the engine's own tick rate)
   * a signal's full entry condition must hold before it first flips
   * actionable. Converts a single noisy sample into N seconds of agreement.
   */
  signalDwellTicks: number;
  /**
   * Ticks an already-actionable signal tolerates its raw condition dropping
   * before standing down — smooths a signal flapping actionable/blocked
   * across a couple of borderline ticks instead of genuinely reversing.
   */
  signalLatchTicks: number;
  /**
   * Minimum retracement from the rolling high (Beta's micro-dip) or rally
   * from the rolling low (Gamma's mirror), as a percent of that extreme —
   * replaces the old single-tick `spot <= prevSpot` comparison, which was a
   * coin flip on a random walk.
   */
  microMoveMinPct: number;
  /** Ticks of rolling spot history Beta/Gamma's micro-dip/rally reads its high/low water mark from. */
  microMoveLookbackTicks: number;
  /**
   * Alpha's actual entry proximity band, percent of the wall — deliberately
   * narrower than `invalidationPct` so an entry never sits one tick from its
   * own invalidation exit; the two used to share the same number.
   */
  alphaEntryBandPct: number;

  /**
   * Final multiplier on the stop distance per India VIX regime (Calm /
   * Normal / Elevated / Panic — `lib/tools/vix.ts`'s own bands), applied
   * after the per-protocol %/wall-anchor blend above. Elevated/Panic widen
   * it so ordinary noise in a genuinely riskier tape doesn't stop a trade
   * out prematurely; Calm/Normal are 1 (no change) by default.
   */
  vixStopMultiplier: Record<VixRegime, number>;
  /**
   * Multiplier on `riskPct` per the same VIX regime, applied independently
   * of `vixStopMultiplier` — a wider stop already shrinks lot count on its
   * own (`riskPerLot` grows), but sizing down the risk-money budget too in
   * Elevated/Panic makes that a deliberate, additional choice rather than
   * an accident of the stop-distance formula.
   */
  vixRiskPctMultiplier: Record<VixRegime, number>;

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
  wallChallengeMarginPct: 15,
  earlyOiChangeFloor: 1_000,

  maxSpreadPct: 4,
  minChopRangePct: 0.1,
  openingQuietMinutes: 10,

  /**
   * Cut from 30% after an 18-month walk-forward backtest (Aug 2026) showed
   * the strategy losing money at a stable, sample-robust expectancy across
   * every fold — at 30% risk a losing streak alone was enough to explain
   * most of a real account's drawdown (28 trades took Rs 25,000 to Rs 9,008
   * in the reference run). 30% was originally chosen to solve a real
   * problem — 1% resolved every NIFTY signal to zero lots outright — but it
   * solved it by sizing to the *most* capital-hungry index in the universe
   * (BANKEX, whose own 1-lot stop distance alone needs ~30% just to clear
   * the floor), which inflated real dollar risk on every cheaper index at
   * the same time. This value clears the 1-lot floor for the three
   * cheapest/most liquid indices (NIFTY, BANKNIFTY, SENSEX — roughly a
   * 10-14% floor each at current lot sizes) and leaves FINNIFTY and
   * especially BANKEX (~30% floor) resolving to zero lots most of the
   * time on a Rs 25,000 float. That's intentional, not a regression — see
   * `maxPositionCapitalPct` below for why BANKEX in particular is close to
   * unaffordable outright, independent of this number.
   */
  riskPct: 15.0,
  // Same 25% every protocol used before this was split out — no behaviour
  // change until one of these is tuned independently.
  stopPctByProtocol: { ALPHA: 0.25, BETA: 0.25, GAMMA: 0.25 },
  itmDeltaApprox: 0.7,
  // Cut from 4: with `maxPortfolioRiskPct` now the tighter, real binding
  // constraint (see below), a 4th concurrent slot was rarely reachable in
  // practice anyway — this just makes that explicit rather than implicit.
  maxConcurrentPositions: 3,
  invalidationPct: 0.35,
  weakeningMinAdverseMovePct: 0.05,
  /**
   * Raised from 40% — not loosened for its own sake, but corrected against
   * the same lot-size reality `riskPct` above is calibrated to. At current
   * NSE/BSE lot sizes a *single* Zero-OTM (depth-2 ITM) lot already costs
   * more than 40% of a Rs 25,000 float for four of the five indexes (NIFTY
   * ~55%, BANKNIFTY ~56%, FINNIFTY ~72%, BANKEX ~120% — i.e. unaffordable
   * outright even at 100% of capital) — so the old 40% ceiling blocked
   * every one of them regardless of `riskPct`, not just the expensive ones.
   * 60% clears NIFTY/BANKNIFTY/SENSEX's real 1-lot cost while still
   * blocking FINNIFTY and BANKEX, the same three-index split `riskPct`
   * above lands on independently. The real safety rail against this being
   * a large number is `maxPortfolioRiskPct` below, cut hard specifically
   * because a single position can now legitimately be more than half the
   * account: the loss-at-stop ceiling is what has to stay tight, not the
   * premium-spend ceiling a small account structurally can't satisfy at
   * today's lot sizes.
   */
  maxPositionCapitalPct: 60,
  /**
   * Cut from 60% — this is now the primary defence against simultaneous
   * exposure, precisely because `maxPositionCapitalPct` above had to move
   * up to stay solvent at all. 20% means even two of the three affordable
   * indexes stopping out back-to-back costs a bounded, survivable slice of
   * the account rather than compounding toward ruin.
   */
  maxPortfolioRiskPct: 20,
  pcrDivergencePct: 40,

  signalDwellTicks: 3,
  signalLatchTicks: 3,
  microMoveMinPct: 0.05,
  microMoveLookbackTicks: 20,
  alphaEntryBandPct: 0.15,

  vixStopMultiplier: { Calm: 1, Normal: 1, Elevated: 1.25, Panic: 1.5 },
  vixRiskPctMultiplier: { Calm: 1, Normal: 1, Elevated: 0.75, Panic: 0.5 },

  paperCapital: 25_000,
  slippagePct: 0.0015,
  costPerOrder: 25,
};

/**
 * The config a given underlying's own `ChainBuilder`/`SignalEngine`/
 * `RrgEngine` should actually run against — `cfg` (the operator-tunable
 * base, normally `DEFAULT_CONFIG` or `cfgRef.current`) with whatever that
 * index's own `IndexSpec` overrides on top. One merge site rather than a
 * scattered `INDEX_UNIVERSE[u].field ?? cfg.field` at every construction
 * and read site — `useEngine.ts` used to do exactly that inline, but only
 * for the four RRG fields; this covers the rest of the per-index surface
 * `IndexSpec` now carries too.
 *
 * Call once per underlying (construction time for the engine instances;
 * per-position/per-chain lookup for the risk guards, which run across the
 * whole book rather than one underlying at a time) — cheap enough that
 * memoizing it isn't worth the staleness risk if `cfg` itself is ever
 * changed at runtime.
 */
export function effectiveConfig(underlying: string, cfg: EngineConfig): EngineConfig {
  const spec = INDEX_UNIVERSE[underlying];
  if (!spec) return cfg;
  return {
    ...cfg,
    rrgWindow: spec.rrgWindow ?? cfg.rrgWindow,
    rrgMomentumLookback: spec.rrgMomentumLookback ?? cfg.rrgMomentumLookback,
    invalidationPct: spec.invalidationPct ?? cfg.invalidationPct,
    alphaEntryBandPct: spec.alphaEntryBandPct ?? cfg.alphaEntryBandPct,
    microMoveMinPct: spec.microMoveMinPct ?? cfg.microMoveMinPct,
    microMoveLookbackTicks: spec.microMoveLookbackTicks ?? cfg.microMoveLookbackTicks,
    weakeningMinAdverseMovePct: spec.weakeningMinAdverseMovePct ?? cfg.weakeningMinAdverseMovePct,
    shiftLookback: spec.shiftLookback ?? cfg.shiftLookback,
    wallChallengeMarginPct: spec.wallChallengeMarginPct ?? cfg.wallChallengeMarginPct,
    earlyOiChangeFloor: spec.earlyOiChangeFloor ?? cfg.earlyOiChangeFloor,
    maxSpreadPct: spec.maxSpreadPct ?? cfg.maxSpreadPct,
    minChopRangePct: spec.minChopRangePct ?? cfg.minChopRangePct,
  };
}

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
