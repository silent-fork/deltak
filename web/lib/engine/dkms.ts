import type {
  ChainRow,
  CoaLevels,
  OptionChain,
  OptionType,
  Protocol,
  Quadrant,
  Signal,
} from "@/lib/types";
import type { OiBuildupType } from "@/lib/market/constants";
import type { VixRegime } from "@/lib/tools/volatilityDeskTypes";
import type { EngineConfig } from "./config";
import { DAYLIGHT_REST_MIN, MARKET_OPEN_MIN } from "./config";
import type { ChainBuilder } from "./coa";
import type { ScripMaster } from "./scripMaster";
import { classifyProtocol, wallStopPoints } from "./risk";
import { calculateSize } from "./sizing";

// Re-exported so existing `@/lib/engine/dkms` imports (protocol
// classification's original home) keep working now that the definition
// itself lives in `./risk`, which needs it too for `thesisIntact` — moving
// it there instead of the other direction avoids a risk.ts <-> dkms.ts
// import cycle (dkms.ts already needs `wallStopPoints` from risk.ts).
export { classifyProtocol };

/**
 * DeltaK Matrix Strategy signal engine — port of `backend/app/engine/dkms.py`.
 *
 * Regime selection from COA 2.0 level migration:
 *
 *   ALPHA  support solid,      resistance solid       → range scalps at both bounds
 *   BETA   support solid,      resistance migrating ↑ → ITM calls on micro-dips; puts banned
 *   GAMMA  support migrating ↓, resistance solid      → ITM puts; calls banned
 *   DELTA  both migrating                             → auto-driver muted
 *
 * Invariants enforced on every candidate: the Zero-OTM rule (longs restricted to
 * the 2nd/3rd strike deep ITM), the RRG gate (Lagging nodes are high-decay and
 * forbidden), and the directional bans above.
 */

/** RRG quadrants that permit opening a long option position. */
const ENTRY_QUADRANTS: Quadrant[] = ["LEADING", "IMPROVING"];

/**
 * Beta's micro-dip and Gamma's micro-rally — replaces the old `spot <=
 * prevSpot` single-tick comparison, which was a coin flip on any random
 * walk (worse: `<=` also counts a flat tick as "dipping"). Requires a real
 * retracement from the rolling extreme over `history`, not just "less than
 * the immediately previous sample."
 *
 * `history` includes the current tick (the caller pushes before calling),
 * so a single-sample history can never show a real break — the function
 * fails closed on a cold start rather than needing a separate bootstrap
 * case, which is the right default for a noise-reduction gate.
 */
export function rollingExtremeBreak(
  history: number[],
  direction: "dip" | "rally",
  minPct: number,
): boolean {
  if (history.length < 2) return false;
  const current = history[history.length - 1];
  if (current <= 0) return false;
  if (direction === "dip") {
    const high = Math.max(...history);
    return current <= high * (1 - minPct / 100);
  }
  const low = Math.min(...history);
  return current >= low * (1 + minPct / 100);
}

/**
 * Realised range over a rolling spot window, as a percent of its mean —
 * `(max-min)/mean * 100`. Phase 3's chop gate for Beta/Gamma: both are
 * momentum entries, and a window with next to no range is a flat tape
 * regardless of what the OI walls or RRG quadrant say. Needs at least 2
 * samples to mean anything; fewer reads as zero range (fails the gate
 * closed rather than needing a separate bootstrap case, the same posture
 * `rollingExtremeBreak` already takes).
 */
export function rollingRangePct(history: number[]): number {
  if (history.length < 2) return 0;
  const max = Math.max(...history);
  const min = Math.min(...history);
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  if (mean <= 0) return 0;
  return ((max - min) / mean) * 100;
}

/** Confirmation state `applyDwellLatch` carries across `evaluate()` calls — see its own doc comment. */
export interface DwellState {
  setupKey: string | null;
  dwellTicks: number;
  latchTicksLeft: number;
  armed: boolean;
}

export const emptyDwellState = (): DwellState => ({
  setupKey: null,
  dwellTicks: 0,
  latchTicksLeft: 0,
  armed: false,
});

/**
 * Confirm-over-N-ticks, then tolerate-M-ticks-of-drop before disarming —
 * the one mechanism standing between every entry gate in `evaluate()` and
 * `actionable` flipping on a single noisy tick. Every check upstream
 * (protocol trigger, Zero-OTM strike, RRG quadrant, sizing, PCR/buildup
 * agreement) is re-derived fresh from the current tick as it always was;
 * this only decides whether that instantaneous verdict has held up long
 * enough, and recently enough, to act on.
 *
 * `setupKey` identifies *which* setup is qualifying (protocol + side +
 * instrument) — a change in what's qualifying resets dwell rather than
 * inheriting ticks accumulated toward a different trade, and a genuinely
 * new setup starting mid-latch correctly does not inherit the old one's
 * grace window either.
 *
 * Pure and side-effect-free: takes the previous state, returns the next
 * one and the verdict, rather than mutating anything — the same shape as
 * `decideTrail`/`decideExit` in `risk.ts`, and independently testable the
 * same way.
 */
export function applyDwellLatch(
  prev: DwellState,
  rawQualifies: boolean,
  setupKey: string | null,
  dwellTicks: number,
  latchTicks: number,
): { actionable: boolean; state: DwellState } {
  if (rawQualifies && setupKey) {
    const continuing = setupKey === prev.setupKey;
    const nextDwellTicks = continuing ? prev.dwellTicks + 1 : 1;
    const armed = nextDwellTicks >= dwellTicks;
    return {
      actionable: armed,
      state: { setupKey, dwellTicks: nextDwellTicks, latchTicksLeft: latchTicks, armed },
    };
  }

  // Raw condition failed this tick — stay actionable through the grace
  // window if this setup was already armed, otherwise reset entirely.
  if (prev.armed && prev.latchTicksLeft > 0) {
    return {
      actionable: true,
      state: { ...prev, latchTicksLeft: prev.latchTicksLeft - 1 },
    };
  }
  return { actionable: false, state: emptyDwellState() };
}

/**
 * A CE thesis is bullish, a PE thesis bearish. `OIBuildup` classifies the
 * underlying's own futures the same way COA classifies a single wall — price
 * and OI moving together is conviction, apart is an unwind — and a thesis
 * that contradicts fresh futures positioning is exactly the case a wall's
 * "solid" shift can't see on its own (short-covering can build a put wall
 * that reads identically to genuine floor-defense).
 *
 * `null` (not yet fetched, or the market is quiet) is permissive by design —
 * this is a confirming signal layered on top of COA/RRG, not a dependency.
 */
export function buildupContradicts(
  optionType: OptionType,
  buildupClass: OiBuildupType | null,
): boolean {
  if (!buildupClass) return false;
  return optionType === "CE" ? buildupClass === "Short Built Up" : buildupClass === "Long Built Up";
}

export interface EvaluateContext {
  /** Cumulative, whole-market PCR for this underlying — set beside the chain's own window PCR. */
  marketPcr?: number | null;
  /** This underlying's near-expiry futures OIBuildup class, if fetched. */
  buildupClass?: OiBuildupType | null;
  /**
   * Whether there is a real (or simulated) market to trade in right now —
   * `useEngine`'s own `trading = marketOpen || simulated`, the same flag
   * `planTick` gates the risk guards on. Defaults to `true` so every existing
   * caller (chiefly the test suite, which has no notion of wall-clock time)
   * keeps evaluating as it always did; the engine's tick loop is the one
   * real caller that ever passes `false`.
   */
  trading?: boolean;
  /**
   * India VIX's current regime (`lib/tools/vix.ts`), if the Volatility
   * Desk's public NSE read has landed — `null`/absent leaves stop sizing
   * and risk% exactly as they were before this existed. Same public,
   * unauthenticated source regardless of broker, so this is the one piece
   * of market-data context here that isn't gated on which broker session
   * is active.
   */
  vixRegime?: VixRegime | null;
  /**
   * IST minutes-since-midnight at evaluation time — `useEngine`'s own
   * `istMinutes()`, threaded through rather than read directly off the wall
   * clock here so a caller with no notion of session time (chiefly the test
   * suite) can leave it unset and get the pre-Phase-3 behaviour: no
   * opening/closing quiet window. `null`/absent means "unknown," not
   * "market open" or "market closed" — `trading` above is what answers
   * that question; this only ever narrows a `trading: true` tick further.
   */
  sessionMinute?: number | null;
}

const emptyLevels = (): CoaLevels => ({
  aegis_0: null,
  zenith_0: null,
  aegis_1: null,
  zenith_1: null,
  aegis_shift: 0,
  zenith_shift: 0,
  aegis_trail: [],
  zenith_trail: [],
});

export class SignalEngine {
  /** Rolling spot history for Beta/Gamma's micro-dip/rally — see `rollingExtremeBreak`. */
  private spotWindow: number[] = [];
  /** Confirm-over-N-ticks state for the final `actionable` decision — see `applyDwellLatch`. */
  private dwellState: DwellState = emptyDwellState();

  constructor(
    private underlying: string,
    private builder: ChainBuilder,
    private cfg: EngineConfig,
  ) {}

  private blocked(
    protocol: Protocol,
    levels: CoaLevels,
    reason: string,
    headline: string,
    rationale: string[],
  ): Signal {
    return {
      underlying: this.underlying,
      protocol,
      headline,
      rationale,
      actionable: false,
      blocked_reason: reason,
      token: null,
      trading_symbol: null,
      option_type: null,
      strike: null,
      itm_depth: null,
      entry_price: null,
      stop_loss: null,
      stop_loss_points: null,
      target_1: null,
      target_2: null,
      quadrant: null,
      sizing: null,
      levels,
      generated_at: new Date().toISOString().slice(0, 19),
    };
  }

  private rowFor(chain: OptionChain, strike: number): ChainRow | undefined {
    return chain.rows.find((r) => Math.abs(r.strike - strike) < 1e-6);
  }

  evaluate(
    chain: OptionChain,
    master: ScripMaster,
    capital: number,
    maxDeployable?: number,
    context: EvaluateContext = {},
  ): Signal {
    const { marketPcr = null, buildupClass = null, trading = true, vixRegime = null } = context;
    const levels = chain.levels;
    const spot = chain.spot;
    if (spot > 0) {
      this.spotWindow.push(spot);
      if (this.spotWindow.length > this.cfg.microMoveLookbackTicks) this.spotWindow.shift();
    }

    const protocol = classifyProtocol(levels, this.cfg.levelShiftTolerance);
    const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-IN"));

    const rationale = [
      `COA 1.0 walls — Aegis-0 ${fmt(levels.aegis_0)} / Zenith-0 ${fmt(levels.zenith_0)}`,
      `COA 2.0 live — Aegis-1 ${fmt(levels.aegis_1)} (shift ${levels.aegis_shift >= 0 ? "+" : ""}${levels.aegis_shift}) / ` +
        `Zenith-1 ${fmt(levels.zenith_1)} (shift ${levels.zenith_shift >= 0 ? "+" : ""}${levels.zenith_shift})`,
      `PCR ${chain.pcr.toFixed(2)} · spot ${spot.toLocaleString("en-IN")} · ATM ${fmt(chain.atm_strike)}`,
    ];

    // A closed exchange has no fill for an entry to reach, and a chain built
    // from replayed history is Friday's prices, not a live read — neither is
    // a market this engine should be proposing a trade against. Checked
    // ahead of every other gate below: a stale-data or a regime read is not
    // the reason there's no signal right now, the closed market is.
    if (!trading) {
      return this.blocked(
        protocol,
        levels ?? emptyLevels(),
        "MARKET_CLOSED",
        "Market closed — signal suppressed",
        [...rationale, "No live market to enter against; DKMS does not propose trades off replayed history."],
      );
    }

    if (spot <= 0 || !chain.rows.length) {
      return this.blocked(protocol, levels ?? emptyLevels(), "NO_DATA", "Awaiting live feed", rationale);
    }

    // Phase 3: no new entries in the opening's settling-in window, or once
    // Daylight Rest is due — existing positions are untouched either way
    // (this only gates fresh entries), and `sessionMinute` unset (the whole
    // test suite, any caller with no notion of session time) skips both
    // checks entirely rather than reading as either edge.
    if (context.sessionMinute != null) {
      if (context.sessionMinute < MARKET_OPEN_MIN + this.cfg.openingQuietMinutes) {
        return this.blocked(protocol, levels, "OPENING_QUIET", "Opening — settling in", [
          ...rationale,
          `No new entries in the first ${this.cfg.openingQuietMinutes} minutes — spreads and walls haven't settled yet.`,
        ]);
      }
      if (context.sessionMinute >= DAYLIGHT_REST_MIN) {
        return this.blocked(protocol, levels, "CLOSING_QUIET", "Daylight Rest — no new entries", [
          ...rationale,
          "Past 3:15 PM IST: existing risk is being flattened, not added to.",
        ]);
      }
    }

    if (protocol === "DELTA") {
      return this.blocked(protocol, levels, "VOLATILITY_TRAP", "Protocol Delta — auto-driver muted", [
        ...rationale,
        "Both bounds are migrating: consolidation / volatility trap.",
      ]);
    }

    // -- directional intent -------------------------------------------- //
    let optionType: OptionType;
    let trigger = "";

    if (protocol === "ALPHA") {
      // Deliberately narrower than `invalidationPct`: the two used to share
      // one number, which meant an entry could sit one tick from its own
      // invalidation exit. This band is entry-only; the exit side still
      // watches the wider `invalidationPct` band exactly as before.
      const band = this.cfg.alphaEntryBandPct / 100;
      const nearSupport =
        levels.aegis_1 !== null && Math.abs(spot - levels.aegis_1) <= levels.aegis_1 * band;
      const nearResistance =
        levels.zenith_1 !== null && Math.abs(spot - levels.zenith_1) <= levels.zenith_1 * band;

      if (nearSupport && !nearResistance) {
        optionType = "CE";
        trigger = `Spot at Aegis-1 ${fmt(levels.aegis_1)} — equilibrium bounce long.`;
      } else if (nearResistance && !nearSupport) {
        optionType = "PE";
        trigger = `Spot at Zenith-1 ${fmt(levels.zenith_1)} — equilibrium fade short.`;
      } else {
        return this.blocked(protocol, levels, "MID_RANGE", "Protocol Alpha — waiting for a bound", [
          ...rationale,
          "Spot is mid-range; Alpha only engages at Aegis-1 or Zenith-1.",
        ]);
      }
    } else if (protocol === "BETA") {
      optionType = "CE";
      const dipping = rollingExtremeBreak(this.spotWindow, "dip", this.cfg.microMoveMinPct);
      if (!dipping) {
        return this.blocked(protocol, levels, "AWAIT_DIP", "Protocol Beta — awaiting downward micro-dip", [
          ...rationale,
          "Protocol Beta ascension — call bias armed, awaiting micro-dip.",
          "Put purchases are banned under Beta.",
        ]);
      }
      trigger = "Protocol Beta ascension — buying the micro-dip in ITM calls.";
    } else {
      optionType = "PE";
      const rallying = rollingExtremeBreak(this.spotWindow, "rally", this.cfg.microMoveMinPct);
      if (!rallying) {
        return this.blocked(protocol, levels, "AWAIT_RALLY", "Protocol Gamma — awaiting upward micro-rally", [
          ...rationale,
          "Protocol Gamma cascade — put bias armed, awaiting micro-rally.",
          "Call purchases are banned under Gamma.",
        ]);
      }
      trigger = "Protocol Gamma cascade — support migrating down, ITM puts armed.";
    }

    // -- Zero-OTM strike selection -------------------------------------- //
    let chosen: { inst: ReturnType<ChainBuilder["selectItm"]>; leg: NonNullable<ChainRow["call"]>; depth: number } | null =
      null;

    for (let depth = this.cfg.minItmDepth; depth <= this.cfg.maxItmDepth; depth++) {
      const inst = this.builder.selectItm(master, optionType, spot, depth);
      if (!inst) continue;
      const row = this.rowFor(chain, inst.strike);
      const leg = optionType === "CE" ? row?.call : row?.put;
      if (!leg || leg.ltp <= 0) continue;
      if (leg.moneyness !== "ITM") continue; // Zero-OTM rule
      if (leg.quadrant === "LAGGING") continue; // high decay node
      chosen = { inst, leg, depth };
      break;
    }

    if (!chosen || !chosen.inst) {
      return this.blocked(protocol, levels, "NO_VALID_ITM", "No compliant ITM node", [
        ...rationale,
        trigger,
        "Zero-OTM rule: 2nd/3rd ITM strikes are unpriced or sitting in the Lagging quadrant (high decay).",
      ]);
    }

    const { inst, leg, depth } = chosen;
    const quadrant = leg.quadrant;

    // -- risk geometry --------------------------------------------------- //
    const r2 = (n: number) => Number(n.toFixed(2));
    const entry = leg.best_ask > 0 ? leg.best_ask : leg.ltp;
    let stopPoints = r2(entry * this.cfg.stopPctByProtocol[protocol]);

    // Anchor the stop to the *same* wall `checkInvalidation` already
    // watches for this option side (support/Aegis-1 under a CE long,
    // resistance/Zenith-1 over a PE long — the exact pairing
    // `checkInvalidation` uses, generalised across all three protocols
    // rather than kept Alpha-specific), instead of leaving the two as
    // independent, uncoordinated exit triggers that can fire in either
    // order for no principled reason. A stop derived from the distance to
    // the same line invalidation itself breaches at tends to resolve at
    // roughly the same moment invalidation would have fired anyway.
    // Clamped to [0.5x, 1.5x] of the percentage-based stop: wall data
    // informs the number, but never swings it wildly outside the range
    // this engine has actually been sized and tested against.
    const wsp = wallStopPoints({
      optionType,
      spot,
      aegis1: levels.aegis_1,
      zenith1: levels.zenith_1,
      invalidationPct: this.cfg.invalidationPct,
      itmDeltaApprox: this.cfg.itmDeltaApprox,
    });
    if (wsp !== null) {
      stopPoints = r2(Math.min(stopPoints * 1.5, Math.max(stopPoints * 0.5, wsp)));
    }

    // A genuinely riskier tape widens the stop on top of whatever the
    // %/wall blend above already settled on — applied last, as a final
    // regime-level adjustment rather than folded into the wall-anchor
    // clamp, so the two stay independently reasoned about. Calm/Normal
    // are 1x by default; see `vixStopMultiplier`'s own doc comment.
    if (vixRegime) {
      stopPoints = r2(stopPoints * this.cfg.vixStopMultiplier[vixRegime]);
    }

    const stop = r2(Math.max(0.05, entry - stopPoints));
    let target1 = r2(entry + stopPoints * 1.5);
    const target2 = r2(entry + stopPoints * 3.0);

    // Alpha buys near a wall expecting a move to the *opposite* one — anchor
    // TP1 to that actual distance instead of a blind 1.5R wherever there's
    // COA data to do it with. `itmDeltaApprox` translates the wall's
    // distance in underlying points into an approximate premium distance
    // (see its own doc comment — this is a stated approximation, not a real
    // Greek). Clamped to [old 1.5R, 2.9R] either way: a wall right on top of
    // entry must not produce a worse target than before, and a distant one
    // must not reach all the way to `target2` (3R) — TP1 has to stay a real
    // scale-out level strictly ahead of the final target, not collapse onto
    // it.
    if (protocol === "ALPHA") {
      const wallDistance =
        optionType === "CE"
          ? levels.zenith_1 !== null
            ? Math.max(0, levels.zenith_1 - spot)
            : null
          : levels.aegis_1 !== null
            ? Math.max(0, spot - levels.aegis_1)
            : null;
      if (wallDistance !== null && wallDistance > 0) {
        const wallImpliedTarget = r2(entry + wallDistance * this.cfg.itmDeltaApprox);
        const ceiling = r2(entry + stopPoints * 2.9);
        target1 = r2(Math.min(ceiling, Math.max(target1, wallImpliedTarget)));
      }
    }

    // A wider stop (above) already shrinks lot count on its own —
    // `riskPerLot` grows with it — but scaling `riskPct` down too in
    // Elevated/Panic makes the size-down a deliberate, additional choice
    // rather than an accident of the stop-distance formula. Calm/Normal
    // are 1x by default; see `vixRiskPctMultiplier`'s own doc comment.
    const effectiveRiskPct = vixRegime
      ? r2(this.cfg.riskPct * this.cfg.vixRiskPctMultiplier[vixRegime])
      : this.cfg.riskPct;

    const sizing = calculateSize({
      underlying: this.underlying,
      stopLossPoints: stopPoints,
      capital,
      riskPct: effectiveRiskPct,
      lotSize: inst!.lotSize || undefined,
      entryPrice: entry,
      maxDeployable,
      maxPositionCapitalPct: this.cfg.maxPositionCapitalPct,
    });

    rationale.push(trigger);
    rationale.push(
      `Zero-OTM compliant: ${depth}${depth === 2 ? "nd" : "rd"} ITM ${optionType} @ ${fmt(inst!.strike)} (depth ${leg.itm_depth})`,
    );
    if (quadrant) {
      rationale.push(
        `RRG node ${quadrant} — RS-Ratio ${leg.rs_ratio?.toFixed(2)} / RS-Momentum ${leg.rs_momentum?.toFixed(2)}`,
      );
    }
    if (vixRegime && vixRegime !== "Calm" && vixRegime !== "Normal") {
      rationale.push(
        `India VIX ${vixRegime} — stop widened ${this.cfg.vixStopMultiplier[vixRegime]}x, risk sized to ${effectiveRiskPct.toFixed(1)}% of ${this.cfg.riskPct}%.`,
      );
    }

    // -- confirming layers: futures OI buildup and PCR agreement ---------- //
    const buildupMismatch = buildupContradicts(optionType, buildupClass);
    if (buildupMismatch) {
      rationale.push(
        `Futures OI buildup reads ${buildupClass} — contradicts a ${optionType === "CE" ? "bullish" : "bearish"} thesis.`,
      );
    }

    const pcrDivergencePct =
      marketPcr !== null && marketPcr > 0 && chain.pcr > 0
        ? (Math.abs(chain.pcr - marketPcr) / marketPcr) * 100
        : null;
    const pcrDivergent = pcrDivergencePct !== null && pcrDivergencePct > this.cfg.pcrDivergencePct;
    if (pcrDivergent) {
      rationale.push(
        `PCR window ${chain.pcr.toFixed(2)} diverges ${pcrDivergencePct!.toFixed(0)}% from cumulative ${marketPcr!.toFixed(2)} — weight sits outside the rendered ladder.`,
      );
    }

    // -- Phase 3: execution-quality and momentum-regime filters ---------- //
    const spreadPct =
      leg.best_bid > 0 && leg.best_ask > 0
        ? ((leg.best_ask - leg.best_bid) / ((leg.best_ask + leg.best_bid) / 2)) * 100
        : null;
    const spreadTooWide = spreadPct !== null && spreadPct > this.cfg.maxSpreadPct;
    if (spreadTooWide) {
      rationale.push(
        `Bid-ask spread ${spreadPct!.toFixed(1)}% on ${inst!.symbol} exceeds the ${this.cfg.maxSpreadPct}% execution-quality ceiling.`,
      );
    }

    // Alpha is deliberately exempt — a tight, low-range tape at a wall is
    // the setup, not evidence there isn't one. Beta/Gamma need genuine
    // movement to justify a momentum entry at all.
    const chopRangePct = rollingRangePct(this.spotWindow);
    const tooFlat = protocol !== "ALPHA" && chopRangePct < this.cfg.minChopRangePct;
    if (tooFlat) {
      rationale.push(
        `Realised range ${chopRangePct.toFixed(2)}% over the rolling window is under the ${this.cfg.minChopRangePct}% floor — flat tape, no real momentum to trade.`,
      );
    }

    // Everything that reaches this point already cleared the protocol
    // trigger and Zero-OTM strike selection *this tick* (both return early
    // via `blocked()` otherwise) — the one flicker-prone check left is
    // whether the RRG quadrant currently permits an entry. `applyDwellLatch`
    // requires that to hold for `signalDwellTicks` consecutive ticks before
    // arming, and tolerates `signalLatchTicks` ticks of it dropping again
    // before disarming — see its own doc comment for why this sits here
    // rather than wrapping the hard vetoes below, which stay immediate.
    const rawSetupQualifies = !quadrant || ENTRY_QUADRANTS.includes(quadrant);
    const setupKey = rawSetupQualifies ? `${protocol}:${optionType}:${inst!.token}` : null;
    const confirmation = applyDwellLatch(
      this.dwellState,
      rawSetupQualifies,
      setupKey,
      this.cfg.signalDwellTicks,
      this.cfg.signalLatchTicks,
    );
    this.dwellState = confirmation.state;

    let actionable = sizing.lots > 0 && confirmation.actionable;
    let blockedReason: string | null = null;

    if (sizing.lots === 0) {
      blockedReason = sizing.capped_by ?? "ZERO_LOTS";
      rationale.push("Sizing resolved to zero lots — entry suppressed.");
    } else if (quadrant === "WEAKENING") {
      actionable = false;
      blockedReason = "WEAKENING_NODE";
      rationale.push("Weakening quadrant: momentum fading — scaling out of open exposure rather than adding.");
    } else if (quadrant === "LAGGING") {
      actionable = false;
      blockedReason = "LAGGING_NODE";
    } else if (buildupMismatch) {
      actionable = false;
      blockedReason = "BUILDUP_MISMATCH";
    } else if (pcrDivergent) {
      actionable = false;
      blockedReason = "PCR_DIVERGENCE";
    } else if (spreadTooWide) {
      actionable = false;
      blockedReason = "WIDE_SPREAD";
    } else if (tooFlat) {
      actionable = false;
      blockedReason = "FLAT_TAPE";
    } else if (!confirmation.actionable) {
      blockedReason = "AWAITING_CONFIRMATION";
      rationale.push(
        `Confirming — held ${this.dwellState.dwellTicks}/${this.cfg.signalDwellTicks} tick(s) so far.`,
      );
    }

    const title = protocol.charAt(0) + protocol.slice(1).toLowerCase();
    return {
      underlying: this.underlying,
      protocol,
      headline: actionable ? `Protocol ${title} · BUY ${inst!.symbol}` : `Protocol ${title} · standby`,
      rationale,
      actionable,
      blocked_reason: blockedReason,
      token: inst!.token,
      trading_symbol: inst!.symbol,
      option_type: optionType,
      strike: inst!.strike,
      itm_depth: leg.itm_depth,
      entry_price: r2(entry),
      stop_loss: stop,
      stop_loss_points: stopPoints,
      target_1: target1,
      target_2: target2,
      quadrant,
      sizing,
      levels,
      generated_at: new Date().toISOString().slice(0, 19),
    };
  }
}
