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
import type { EngineConfig } from "./config";
import type { ChainBuilder } from "./coa";
import type { ScripMaster } from "./scripMaster";
import { calculateSize } from "./sizing";

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

export function classifyProtocol(levels: CoaLevels, tolerance: number): Protocol {
  if (levels.aegis_1 === null || levels.zenith_1 === null) return "DELTA";

  const supportSolid = Math.abs(levels.aegis_shift) <= tolerance;
  const resistanceSolid = Math.abs(levels.zenith_shift) <= tolerance;
  const resistanceUp = levels.zenith_shift > tolerance;
  const supportDown = levels.aegis_shift < -tolerance;

  if (supportSolid && resistanceSolid) return "ALPHA";
  if (supportSolid && resistanceUp) return "BETA";
  if (resistanceSolid && supportDown) return "GAMMA";
  return "DELTA";
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
  private lastSpot = 0;

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
    const { marketPcr = null, buildupClass = null } = context;
    const levels = chain.levels;
    const spot = chain.spot;
    const prevSpot = this.lastSpot;
    this.lastSpot = spot;

    const protocol = classifyProtocol(levels, this.cfg.levelShiftTolerance);
    const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("en-IN"));

    const rationale = [
      `COA 1.0 walls — Aegis-0 ${fmt(levels.aegis_0)} / Zenith-0 ${fmt(levels.zenith_0)}`,
      `COA 2.0 live — Aegis-1 ${fmt(levels.aegis_1)} (shift ${levels.aegis_shift >= 0 ? "+" : ""}${levels.aegis_shift}) / ` +
        `Zenith-1 ${fmt(levels.zenith_1)} (shift ${levels.zenith_shift >= 0 ? "+" : ""}${levels.zenith_shift})`,
      `PCR ${chain.pcr.toFixed(2)} · spot ${spot.toLocaleString("en-IN")} · ATM ${fmt(chain.atm_strike)}`,
    ];

    if (spot <= 0 || !chain.rows.length) {
      return this.blocked(protocol, levels ?? emptyLevels(), "NO_DATA", "Awaiting live feed", rationale);
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
      const band = this.cfg.invalidationPct / 100;
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
      const dipping = prevSpot > 0 && spot <= prevSpot;
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
    const stopPoints = r2(entry * this.cfg.defaultStopPct);
    const stop = r2(Math.max(0.05, entry - stopPoints));
    const target1 = r2(entry + stopPoints * 1.5);
    const target2 = r2(entry + stopPoints * 3.0);

    const sizing = calculateSize({
      underlying: this.underlying,
      stopLossPoints: stopPoints,
      capital,
      riskPct: this.cfg.riskPct,
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

    let actionable = sizing.lots > 0 && (!quadrant || ENTRY_QUADRANTS.includes(quadrant));
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
