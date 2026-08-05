import { INDEX_UNIVERSE } from "@/lib/engine/config";
import type { Side } from "@/lib/types";

/**
 * Statutory and broker charges on an index-options trade.
 *
 * Paper mode exists to answer "would this strategy have made money", and a flat
 * per-order fee cannot answer it: on index options the charges are dominated by
 * STT and exchange turnover, both proportional to premium turnover, and both
 * levied asymmetrically — STT on the sell leg only, stamp duty on the buy leg
 * only. A ₹25 flat fee flatters a strategy that scalps small premiums and
 * penalises one that holds size, which is exactly backwards.
 *
 * Two cards below, one per exchange this app actually trades on — NSE
 * (NIFTY/BANKNIFTY/FINNIFTY) and BSE (SENSEX/BANKEX), picked per underlying
 * by `ratesForUnderlying`. Both carry the Budget 2026 options STT (0.15% of
 * sell premium, effective 2026-04-01, up from 0.10%); the exchange
 * transaction charge is exchange-specific — NSE's 2024-10-01 revision
 * (~₹3,503/crore) vs BSE's own Sensex/Bankex rate (₹3,250/crore). These are
 * rate *cards*, not constants: SEBI and the exchanges revise them, so they
 * live in objects with their basis stated, and `estimateCharges` takes the
 * card as an argument so a caller can price a trade against a different one.
 */

export interface RateCard {
  /** Flat brokerage per executed order, in rupees. */
  brokeragePerOrder: number;
  /** …capped at this fraction of turnover, whichever is lower. */
  brokerageMaxPct: number;
  /** Securities Transaction Tax, on the sell leg's premium. */
  sttSellPct: number;
  /** Exchange transaction charge, on premium turnover. */
  exchangePct: number;
  /** SEBI turnover fee, on premium turnover. */
  sebiPct: number;
  /** NSE investor-protection fund contribution, on premium turnover. */
  ipftPct: number;
  /** Stamp duty, on the buy leg's premium. */
  stampBuyPct: number;
  /** GST on brokerage + exchange + SEBI fees. */
  gstPct: number;
}

/**
 * NSE index options (NIFTY/BANKNIFTY/FINNIFTY). STT is the Budget 2026 rate,
 * effective 2026-04-01 (up from 0.10% pre-Budget); the rest are the 2024-10-01
 * exchange-transaction-charge revision.
 */
export const NSE_OPTIONS_RATES: RateCard = {
  brokeragePerOrder: 20,
  brokerageMaxPct: 0.0025,
  sttSellPct: 0.0015,
  exchangePct: 0.0003503,
  sebiPct: 0.000001,
  ipftPct: 0.000005,
  stampBuyPct: 0.00003,
  gstPct: 0.18,
};

/**
 * BSE index options (SENSEX/BANKEX). BSE's own transaction-charge and STT
 * basis differ from NSE's — same statutory STT rate, but a different exchange
 * turnover fee (₹3,250/crore vs NSE's ~₹3,503/crore) and no published IPFT
 * line the way NSE has one.
 */
export const BSE_OPTIONS_RATES: RateCard = {
  brokeragePerOrder: 20,
  brokerageMaxPct: 0.0025,
  sttSellPct: 0.0015,
  exchangePct: 0.000325,
  sebiPct: 0.000001,
  ipftPct: 0,
  stampBuyPct: 0.00003,
  gstPct: 0.18,
};

/**
 * Which rate card applies to an underlying's options — NSE lists
 * NIFTY/BANKNIFTY/FINNIFTY, BSE lists SENSEX/BANKEX. Using `NSE_OPTIONS_RATES`
 * unconditionally for a BSE contract was the bug this fixes: a SENSEX signal's
 * "Costs" estimate was quietly pricing NSE's transaction charge and pre-Budget
 * STT instead of the exchange it actually trades on.
 */
export function ratesForUnderlying(underlying: string): RateCard {
  return INDEX_UNIVERSE[underlying]?.exchange === "BSE" ? BSE_OPTIONS_RATES : NSE_OPTIONS_RATES;
}

export interface Charges {
  brokerage: number;
  stt: number;
  exchange: number;
  sebi: number;
  ipft: number;
  stamp: number;
  gst: number;
  total: number;
  /** Premium turnover the percentage-based charges were taken on. */
  turnover: number;
}

const r2 = (n: number) => Number(n.toFixed(2));

const EMPTY: Charges = {
  brokerage: 0,
  stt: 0,
  exchange: 0,
  sebi: 0,
  ipft: 0,
  stamp: 0,
  gst: 0,
  total: 0,
  turnover: 0,
};

/** Charges on one leg — a single buy or a single sell. */
export function estimateCharges(
  leg: { side: Side; price: number; quantity: number },
  rates: RateCard = NSE_OPTIONS_RATES,
): Charges {
  const turnover = leg.price * leg.quantity;
  if (!(turnover > 0)) return { ...EMPTY };

  const brokerage = Math.min(
    rates.brokeragePerOrder,
    turnover * rates.brokerageMaxPct,
  );
  // STT rides the sell leg, stamp duty the buy leg. Charging both on both is
  // the single easiest way to make a paper ledger disagree with a real one.
  const stt = leg.side === "SELL" ? turnover * rates.sttSellPct : 0;
  const stamp = leg.side === "BUY" ? turnover * rates.stampBuyPct : 0;
  const exchange = turnover * rates.exchangePct;
  const sebi = turnover * rates.sebiPct;
  const ipft = turnover * rates.ipftPct;
  const gst = (brokerage + exchange + sebi + ipft) * rates.gstPct;

  // Round the parts first, then sum them. Rounding the exact total instead
  // leaves a breakdown that does not add up to the figure beside it — and this
  // breakdown is shown to an operator and booked by the ledger, so the two have
  // to be the same number to the paisa.
  const parts = {
    brokerage: r2(brokerage),
    stt: r2(stt),
    exchange: r2(exchange),
    sebi: r2(sebi),
    ipft: r2(ipft),
    stamp: r2(stamp),
    gst: r2(gst),
  };

  return {
    ...parts,
    total: r2(Object.values(parts).reduce((a, b) => a + b, 0)),
    turnover: r2(turnover),
  };
}

/**
 * Both legs of a round trip, priced at entry and at an assumed exit.
 *
 * What the signal panel quotes before a trade: entering costs one buy leg, and
 * every exit — target, stop or the 3:15 flatten — costs one sell leg, so the
 * cost of being in the trade at all is the pair.
 */
export function roundTripCharges(
  entry: { price: number; quantity: number },
  exitPrice: number,
  rates: RateCard = NSE_OPTIONS_RATES,
): { entry: Charges; exit: Charges; total: number } {
  const buy = estimateCharges(
    { side: "BUY", price: entry.price, quantity: entry.quantity },
    rates,
  );
  const sell = estimateCharges(
    { side: "SELL", price: exitPrice, quantity: entry.quantity },
    rates,
  );
  return { entry: buy, exit: sell, total: r2(buy.total + sell.total) };
}
