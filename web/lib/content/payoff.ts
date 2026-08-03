/**
 * Generic options-payoff engine shared by every strategy page under
 * /tools/options-strategies. One correct implementation of "sum the
 * intrinsic value of each leg at expiry, net premium paid or received" beats
 * twelve hand-derived max-profit/max-loss/breakeven formulas that each have
 * their own chance to be wrong.
 */

export type LegType = "call" | "put";
export type LegAction = "buy" | "sell";

export interface Leg {
  type: LegType;
  action: LegAction;
  /** Strike offset from ATM, in units of the underlying's strike step. */
  offset: number;
  /** Contracts on this leg relative to the strategy's base size — 2 for the long side of a 1x2 ratio spread, otherwise 1. */
  qty?: number;
}

export interface PayoffExample {
  underlying: string;
  spot: number;
  strikeStep: number;
  lotSize: number;
}

/**
 * Illustrative per-share premiums by strike offset from ATM, one side of a
 * plausible weekly-index smile — not a live quote. Every strategy page
 * reads the same table so the "example" numbers stay internally consistent
 * with each other instead of each page inventing its own.
 */
const PREMIUM_TABLE: Record<number, { call: number; put: number }> = {
  [-4]: { call: 420, put: 25 },
  [-3]: { call: 360, put: 35 },
  [-2]: { call: 300, put: 55 },
  [-1]: { call: 230, put: 90 },
  [0]: { call: 180, put: 150 },
  [1]: { call: 130, put: 205 },
  [2]: { call: 90, put: 270 },
  [3]: { call: 60, put: 340 },
  [4]: { call: 40, put: 410 },
};

export function premiumFor(type: LegType, offset: number): number {
  const row = PREMIUM_TABLE[offset];
  if (!row) throw new Error(`No illustrative premium at offset ${offset}`);
  return row[type];
}

export function strikeFor(example: PayoffExample, offset: number): number {
  const atm = Math.round(example.spot / example.strikeStep) * example.strikeStep;
  return atm + offset * example.strikeStep;
}

function intrinsic(type: LegType, strike: number, s: number): number {
  return type === "call" ? Math.max(s - strike, 0) : Math.max(strike - s, 0);
}

/** Per-share P&L of one leg at underlying price `s` at expiry. */
function legPnl(leg: Leg, example: PayoffExample, s: number): number {
  const strike = strikeFor(example, leg.offset);
  const premium = premiumFor(leg.type, leg.offset);
  const qty = leg.qty ?? 1;
  const iv = intrinsic(leg.type, strike, s);
  return qty * (leg.action === "buy" ? iv - premium : premium - iv);
}

/** Total per-share P&L of every leg at underlying price `s` at expiry. */
export function payoffAt(legs: Leg[], example: PayoffExample, s: number): number {
  return legs.reduce((acc, leg) => acc + legPnl(leg, example, s), 0);
}

export interface PayoffCurvePoint {
  s: number;
  pnl: number;
}

export interface PayoffSummary {
  curve: PayoffCurvePoint[];
  /** Domain the curve was sampled over, for chart rendering. */
  domain: [number, number];
  breakevens: number[];
  maxProfit: number;
  maxLoss: number;
  unlimitedProfit: boolean;
  unlimitedLoss: boolean;
  netCreditPerShare: number;
}

/**
 * Samples the payoff curve over a wide range (to reliably detect unbounded
 * profit/loss above the highest strike in play) and again over a tight,
 * chart-relevant window around ATM for display.
 */
export function computePayoff(legs: Leg[], example: PayoffExample): PayoffSummary {
  const atm = Math.round(example.spot / example.strikeStep) * example.strikeStep;
  const maxAbsOffset = Math.max(4, ...legs.map((l) => Math.abs(l.offset)));

  const wideMax = atm + maxAbsOffset * example.strikeStep * 6;
  const wideSamples = 400;
  const wideStep = wideMax / wideSamples;
  const tailSlopeSamples = 5;
  let slopeSum = 0;
  for (let i = 0; i < tailSlopeSamples; i++) {
    const sHi = wideMax - i * wideStep;
    const sLo = sHi - wideStep;
    slopeSum += (payoffAt(legs, example, sHi) - payoffAt(legs, example, sLo)) / wideStep;
  }
  const tailSlope = slopeSum / tailSlopeSamples;
  const unlimitedProfit = tailSlope * example.lotSize > 0.5;
  const unlimitedLoss = tailSlope * example.lotSize < -0.5;

  const chartMin = Math.max(0, atm - (maxAbsOffset + 2) * example.strikeStep);
  const chartMax = atm + (maxAbsOffset + 2) * example.strikeStep;
  const n = 240;
  const step = (chartMax - chartMin) / n;
  const curve: PayoffCurvePoint[] = [];
  for (let i = 0; i <= n; i++) {
    const s = chartMin + i * step;
    curve.push({ s, pnl: payoffAt(legs, example, s) * example.lotSize });
  }

  const breakevens: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    const a = curve[i - 1];
    const b = curve[i];
    if ((a.pnl <= 0 && b.pnl > 0) || (a.pnl >= 0 && b.pnl < 0)) {
      const t = a.pnl === b.pnl ? 0 : -a.pnl / (b.pnl - a.pnl);
      breakevens.push(Math.round(a.s + t * (b.s - a.s)));
    }
  }

  const pnls = curve.map((p) => p.pnl);
  const maxProfit = Math.max(...pnls);
  const maxLoss = Math.min(...pnls);
  const netCreditPerShare = legs.reduce((acc, leg) => {
    const premium = premiumFor(leg.type, leg.offset);
    const qty = leg.qty ?? 1;
    return acc + qty * (leg.action === "sell" ? premium : -premium);
  }, 0);

  return {
    curve,
    domain: [chartMin, chartMax],
    breakevens,
    maxProfit,
    maxLoss,
    unlimitedProfit,
    unlimitedLoss,
    netCreditPerShare,
  };
}
