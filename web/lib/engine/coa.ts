import type {
  ChainRow,
  CoaLevels,
  Moneyness,
  OptionChain,
  OptionLeg,
  OptionType,
} from "@/lib/types";
import type { TickStore } from "@/lib/stream/ticks";
import { INDEX_UNIVERSE, type EngineConfig } from "./config";
import type { Instrument, ScripMaster } from "./scripMaster";
import type { RrgEngine } from "./rrg";

/**
 * Chart of Accuracy (COA 1.0 & 2.0) chain assembler — port of
 * `backend/app/engine/coa.py`.
 *
 * COA 1.0 reads the *cumulative* open-interest walls: the static Aegis (support)
 * and Zenith (resistance) carried into the session. COA 2.0 reads the *intraday
 * change* in open interest, which is what actually moves during the day and what
 * the Delta-K driver trades — writers adding puts below spot lift Aegis-1,
 * writers adding calls above spot pin Zenith-1.
 */

export function nearestStrike(spot: number, strikes: number[]): number {
  if (!strikes.length) return 0;
  return strikes.reduce((best, s) =>
    Math.abs(s - spot) < Math.abs(best - spot) ? s : best,
  );
}

/** How many strikes ITM a contract sits. Positive = ITM, 0 = ATM, negative = OTM. */
export function itmDepth(
  strike: number,
  spot: number,
  optionType: OptionType,
  step: number,
): number {
  if (step <= 0) return 0;
  const raw = optionType === "CE" ? (spot - strike) / step : (strike - spot) / step;
  return Math.round(raw);
}

export class ChainBuilder {
  private aegisHist: number[] = [];
  private zenithHist: number[] = [];
  levels: CoaLevels = {
    aegis_0: null,
    zenith_0: null,
    aegis_1: null,
    zenith_1: null,
    aegis_shift: 0,
    zenith_shift: 0,
    aegis_trail: [],
    zenith_trail: [],
  };

  constructor(
    private underlying: string,
    private rrg: RrgEngine,
    private cfg: EngineConfig,
  ) {}

  private get step(): number {
    return INDEX_UNIVERSE[this.underlying].strikeStep;
  }

  private leg(
    inst: Instrument,
    ticks: TickStore,
    spot: number,
    advanceRrg: boolean,
  ): OptionLeg {
    const tick = ticks.get(inst.token);
    const ltp = tick?.ltp ?? 0;
    const close = tick?.close ?? 0;
    const depth = itmDepth(inst.strike, spot, (inst.optionType ?? "CE") as OptionType, this.step);

    const moneyness: Moneyness = depth > 0 ? "ITM" : depth === 0 ? "ATM" : "OTM";
    const r2 = (n: number) => Number(n.toFixed(2));

    const leg: OptionLeg = {
      token: inst.token,
      trading_symbol: inst.symbol,
      ltp: r2(ltp),
      change_pct: close ? r2(((ltp - close) / close) * 100) : 0,
      volume: tick?.volume ?? 0,
      oi: tick?.oi ?? 0,
      oi_change: ticks.oiChange(inst.token),
      oi_change_pct: tick ? r2(tick.oiChangePct) : 0,
      best_bid: r2(tick?.bestBid ?? 0),
      best_ask: r2(tick?.bestAsk ?? 0),
      moneyness,
      itm_depth: depth,
      quadrant: null,
      rs_ratio: null,
      rs_momentum: null,
    };

    if (advanceRrg && ltp > 0 && spot > 0) {
      const p = this.rrg.update(inst.token, ltp, spot);
      leg.rs_ratio = p.rs_ratio;
      leg.rs_momentum = p.rs_momentum;
      leg.quadrant = this.rrg.quadrant(inst.token);
    } else {
      const p = this.rrg.point(inst.token);
      if (p) {
        leg.rs_ratio = p.rs_ratio;
        leg.rs_momentum = p.rs_momentum;
        leg.quadrant = this.rrg.quadrant(inst.token);
      }
    }
    return leg;
  }

  build(
    master: ScripMaster,
    ticks: TickStore,
    spot: number,
    advanceRrg = true,
  ): OptionChain {
    const expiry = master.nearestExpiry(this.underlying);
    const contracts = master.contracts(this.underlying, expiry);
    const spotTick = ticks.get(master.spotToken(this.underlying));
    const spotClose = spotTick?.close ?? 0;
    const r2 = (n: number) => Number(n.toFixed(2));

    const chain: OptionChain = {
      underlying: this.underlying,
      label: INDEX_UNIVERSE[this.underlying].label,
      spot: r2(spot),
      spot_change_pct: spotClose ? r2(((spot - spotClose) / spotClose) * 100) : 0,
      atm_strike: 0,
      expiry,
      rows: [],
      levels: this.levels,
      pcr: 0,
      updated_at: new Date().toISOString().slice(0, 19),
    };
    if (!contracts.length) return chain;

    const allStrikes = master.strikes(this.underlying, expiry);
    const atm = nearestStrike(spot, allStrikes);
    chain.atm_strike = atm;

    const idx = allStrikes.indexOf(atm);
    const lo = Math.max(0, idx - this.cfg.chainDepth);
    const hi = Math.min(allStrikes.length, idx + this.cfg.chainDepth + 1);
    const window = allStrikes.slice(lo, hi);
    const inWindow = new Set(window);

    const byStrike = new Map<number, { CE?: Instrument; PE?: Instrument }>();
    for (const c of contracts) {
      if (!inWindow.has(c.strike) || !c.optionType) continue;
      const entry = byStrike.get(c.strike) ?? {};
      entry[c.optionType] = c;
      byStrike.set(c.strike, entry);
    }

    let totalCallOi = 0;
    let totalPutOi = 0;
    const rows: ChainRow[] = [];

    for (const strike of window) {
      const legs = byStrike.get(strike) ?? {};
      const row: ChainRow = {
        strike,
        call: null,
        put: null,
        is_atm: Math.abs(strike - atm) < 1e-6,
        quantum_horizon: false,
      };
      if (legs.CE) {
        row.call = this.leg(legs.CE, ticks, spot, advanceRrg);
        totalCallOi += row.call.oi;
      }
      if (legs.PE) {
        row.put = this.leg(legs.PE, ticks, spot, advanceRrg);
        totalPutOi += row.put.oi;
      }
      rows.push(row);
    }

    // The Quantum Horizon sits on the last strike at or below spot — the boundary
    // between the ITM-call / OTM-put half and its mirror.
    const below = rows.filter((r) => r.strike <= spot);
    if (below.length) below[below.length - 1].quantum_horizon = true;

    chain.rows = rows;
    chain.pcr = totalCallOi ? Number((totalPutOi / totalCallOi).toFixed(3)) : 0;
    chain.levels = this.deriveLevels(rows, spot);
    return chain;
  }

  private deriveLevels(rows: ChainRow[], spot: number): CoaLevels {
    const putsBelow = rows.filter((r) => r.put && r.strike <= spot);
    const callsAbove = rows.filter((r) => r.call && r.strike >= spot);

    const levels: CoaLevels = {
      aegis_0: null,
      zenith_0: null,
      aegis_1: null,
      zenith_1: null,
      aegis_shift: 0,
      zenith_shift: 0,
      aegis_trail: [],
      zenith_trail: [],
    };

    // --- COA 1.0: cumulative open-interest walls ---
    if (putsBelow.length) {
      const best = putsBelow.reduce((a, b) => (b.put!.oi > a.put!.oi ? b : a));
      levels.aegis_0 = best.put!.oi > 0 ? best.strike : null;
    }
    if (callsAbove.length) {
      const best = callsAbove.reduce((a, b) => (b.call!.oi > a.call!.oi ? b : a));
      levels.zenith_0 = best.call!.oi > 0 ? best.strike : null;
    }

    // --- COA 2.0: intraday OI accumulation ---
    const putWrites = putsBelow.filter((r) => r.put!.oi_change > 0);
    const callWrites = callsAbove.filter((r) => r.call!.oi_change > 0);
    levels.aegis_1 = putWrites.length
      ? putWrites.reduce((a, b) => (b.put!.oi_change > a.put!.oi_change ? b : a)).strike
      : levels.aegis_0;
    levels.zenith_1 = callWrites.length
      ? callWrites.reduce((a, b) => (b.call!.oi_change > a.call!.oi_change ? b : a)).strike
      : levels.zenith_0;

    if (levels.aegis_1 !== null) this.push(this.aegisHist, levels.aegis_1);
    if (levels.zenith_1 !== null) this.push(this.zenithHist, levels.zenith_1);

    levels.aegis_shift = this.shift(this.aegisHist);
    levels.zenith_shift = this.shift(this.zenithHist);
    // Copies, not the live buffers: the HUD renders these and must not observe
    // them mutating underneath a paint.
    levels.aegis_trail = [...this.aegisHist];
    levels.zenith_trail = [...this.zenithHist];
    this.levels = levels;
    return levels;
  }

  private push(hist: number[], value: number) {
    hist.push(value);
    if (hist.length > 60) hist.shift();
  }

  /** Net migration of a level over the history window, in strike steps. */
  private shift(hist: number[]): number {
    if (hist.length < 2 || this.step <= 0) return 0;
    return Math.round((hist[hist.length - 1] - hist[0]) / this.step);
  }

  /**
   * Resolve the *depth*-th ITM contract, honouring the Zero-OTM rule. Depth 2
   * means "second strike deep In-The-Money" relative to the ATM anchor.
   */
  selectItm(
    master: ScripMaster,
    optionType: OptionType,
    spot: number,
    depth: number,
  ): Instrument | null {
    const strikes = master.strikes(this.underlying);
    if (!strikes.length) return null;
    const atm = nearestStrike(spot, strikes);
    const idx = strikes.indexOf(atm);
    const target = optionType === "CE" ? idx - depth : idx + depth;
    if (target < 0 || target >= strikes.length) return null;
    return master.find(this.underlying, strikes[target], optionType);
  }
}
