import type { SizingResult } from "@/lib/types";
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
}): SizingResult {
  const {
    underlying,
    stopLossPoints,
    capital,
    riskPct,
    entryPrice,
    maxDeployable,
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

  let entryCost = 0;
  if (entryPrice && entryPrice > 0 && lots > 0) {
    const budget =
      maxDeployable === undefined ? capital : Math.min(capital, maxDeployable);
    const costPerLot = entryPrice * lot;
    const affordable = costPerLot > 0 ? Math.floor(budget / costPerLot) : 0;
    if (affordable < lots) {
      lots = affordable;
      cappedBy = "CAPITAL";
    }
    entryCost = lots * costPerLot;
  }

  lots = Math.max(0, lots);
  if (lots === 0 && cappedBy === null) cappedBy = "RISK_BUDGET";

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
    capped_by: cappedBy,
  };
}
