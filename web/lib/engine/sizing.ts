import type { Side, SizingResult } from "@/lib/types";
import { INDEX_UNIVERSE } from "./config";

/**
 * Dynamic position sizing — port of `backend/app/engine/sizing.py`.
 *
 *     lots = floor( (capital × risk%) / (stop_loss_points × lot_size) )
 *
 * The risk-derived count is then clamped by two hard realities: you cannot buy
 * more premium than the account holds, and the exchange only trades whole lots.
 */

export function roundToLot(quantity: number, lotSize: number): number {
  if (lotSize <= 0) return Math.max(0, quantity);
  return Math.floor(quantity / lotSize) * lotSize;
}

export function resolveLotSize(underlying: string, override?: number): number {
  if (override && override > 0) return Math.trunc(override);
  return INDEX_UNIVERSE[underlying]?.lotSize ?? 1;
}

export function calculateSize(params: {
  underlying: string;
  stopLossPoints: number;
  capital: number;
  riskPct: number;
  lotSize?: number;
  entryPrice?: number;
  maxDeployable?: number;
  /**
   * Hard ceiling on this position's premium spend, percent of `capital`,
   * independent of the risk-% math above. Without it, a generous risk% on a
   * cheaply-stopped contract sizes up until the capital-affordability clamp
   * binds — which can mean "spend nearly all deployable capital" while the
   * panel still reads "risk N%". This bounds that directly.
   */
  maxPositionCapitalPct?: number;
}): SizingResult {
  const {
    underlying,
    stopLossPoints,
    capital,
    riskPct,
    entryPrice,
    maxDeployable,
    maxPositionCapitalPct,
  } = params;

  const lot = resolveLotSize(underlying, params.lotSize);
  const riskAmount = capital * (riskPct / 100);
  const riskPerLot = Math.max(0, stopLossPoints) * lot;

  let cappedBy: string | null = null;
  let lots = 0;

  if (riskPerLot <= 0) {
    cappedBy = "INVALID_STOP";
  } else {
    lots = Math.floor(riskAmount / riskPerLot);
  }
  // What the risk-% math alone would size this to, before the
  // affordability clamp below can shrink it — the baseline
  // `singleLotConstrained` compares the final lot count against.
  const riskLots = lots;

  let entryCost = 0;
  if (entryPrice && entryPrice > 0 && lots > 0) {
    const deployableBudget =
      maxDeployable === undefined ? capital : Math.min(capital, maxDeployable);
    const concentrationBudget =
      maxPositionCapitalPct && maxPositionCapitalPct > 0
        ? capital * (maxPositionCapitalPct / 100)
        : Infinity;
    const budget = Math.min(deployableBudget, concentrationBudget);
    const costPerLot = entryPrice * lot;
    const affordable = costPerLot > 0 ? Math.floor(budget / costPerLot) : 0;
    if (affordable < lots) {
      lots = affordable;
      cappedBy = concentrationBudget < deployableBudget ? "CONCENTRATION" : "CAPITAL";
    }
    entryCost = lots * costPerLot;
  }

  lots = Math.max(0, lots);
  if (lots === 0 && cappedBy === null) cappedBy = "RISK_BUDGET";

  // The risk math wanted more than one lot, but capital/concentration
  // clamped it down to exactly one — not "the risk math itself only ever
  // wanted 1 lot," which needs no special handling downstream.
  const singleLotConstrained =
    lots === 1 && riskLots > 1 && (cappedBy === "CAPITAL" || cappedBy === "CONCENTRATION");

  const r2 = (n: number) => Number(n.toFixed(2));
  return {
    lots,
    quantity: lots * lot,
    lot_size: lot,
    risk_amount: r2(riskAmount),
    risk_per_lot: r2(riskPerLot),
    entry_cost: r2(entryCost),
    capital: r2(capital),
    risk_pct: riskPct,
    single_lot_constrained: singleLotConstrained,
    capped_by: cappedBy,
  };
}

/* ----------------------------------------------------- portfolio risk cap */

/**
 * Enough of a leg to price its own worst case — a live `Position` and a
 * not-yet-opened candidate both satisfy this.
 */
export interface RiskLeg {
  side: Side;
  avg_price: number;
  stop_loss: number | null;
  quantity: number;
}

/**
 * Rupees lost if this leg's own stop is hit, 0 for a leg with no stop set.
 *
 * This is what a "position count" cap misses: three separately-sized,
 * separately-stopped positions across correlated underlyings (NIFTY,
 * BANKNIFTY, FINNIFTY) can all breach in the same macro move, and the book's
 * real loss is the *sum* of their stops, not a single bounded trade.
 */
export function legRiskAtStop(leg: RiskLeg): number {
  if (leg.stop_loss === null) return 0;
  const perUnit =
    leg.side === "BUY" ? leg.avg_price - leg.stop_loss : leg.stop_loss - leg.avg_price;
  return Math.max(0, perUnit) * leg.quantity;
}

/** Total rupees at risk across every open leg, at each one's own stop. */
export function portfolioRiskAtStop(legs: RiskLeg[]): number {
  return legs.reduce((sum, leg) => sum + legRiskAtStop(leg), 0);
}
