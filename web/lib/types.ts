/**
 * Wire contracts mirroring `backend/app/schemas.py`.
 * Keep both sides in step — the SSE snapshot is the single payload the HUD renders.
 */

import type { INDEX_UNIVERSE } from "./engine/config";
import type { OiBuildupType } from "./market/constants";

export type ExecutionMode = "paper" | "live";
/** Which broker's data (and, for Angel One, trading) API a session is authenticated against. */
export type Broker = "angelone" | "dhan";
/**
 * Who fires an actionable signal. `auto` is the browser's own tick loop —
 * the same "auto-driver" DKMS already names in its Delta-protocol rationale
 * ("auto-driver muted"), just no longer muted the rest of the time. `manual`
 * is today's behaviour: the operator clicks Execute.
 */
export type Automation = "auto" | "manual";
export type OptionType = "CE" | "PE";
export type Side = "BUY" | "SELL";
export type Moneyness = "ITM" | "ATM" | "OTM";
export type Quadrant = "LEADING" | "IMPROVING" | "WEAKENING" | "LAGGING";
export type Protocol = "ALPHA" | "BETA" | "GAMMA" | "DELTA";

export interface RrgPoint {
  rs_ratio: number;
  rs_momentum: number;
}

export interface RrgNode {
  token: string;
  label: string;
  strike: number;
  option_type: OptionType;
  rs_ratio: number;
  rs_momentum: number;
  quadrant: Quadrant;
  tail: RrgPoint[];
}

export interface OptionLeg {
  token: string;
  trading_symbol: string;
  ltp: number;
  change_pct: number;
  volume: number;
  oi: number;
  oi_change: number;
  oi_change_pct: number;
  best_bid: number;
  best_ask: number;
  moneyness: Moneyness;
  itm_depth: number;
  quadrant: Quadrant | null;
  rs_ratio: number | null;
  rs_momentum: number | null;
}

export interface ChainRow {
  strike: number;
  call: OptionLeg | null;
  put: OptionLeg | null;
  is_atm: boolean;
  quantum_horizon: boolean;
}

export interface CoaLevels {
  aegis_0: number | null;
  zenith_0: number | null;
  aegis_1: number | null;
  zenith_1: number | null;
  aegis_shift: number;
  zenith_shift: number;
  /** Where each live wall has stood this session, oldest first. */
  aegis_trail: number[];
  zenith_trail: number[];
}

export interface OptionChain {
  underlying: string;
  label: string;
  spot: number;
  spot_change_pct: number;
  atm_strike: number;
  expiry: string | null;
  rows: ChainRow[];
  levels: CoaLevels;
  pcr: number;
  updated_at: string | null;
}

export interface SizingResult {
  lots: number;
  quantity: number;
  lot_size: number;
  risk_amount: number;
  risk_per_lot: number;
  entry_cost: number;
  capital: number;
  risk_pct: number;
  capped_by: string | null;
  /**
   * True when the risk-% math wanted more than 1 lot but the capital/
   * concentration budget clamped it down to exactly 1 — the case where a
   * later Weakening-quadrant rotation won't be able to scale out (that
   * needs 2+ lots) and falls back to locking the stop to breakeven instead
   * (see `checkWeakeningRotation` in `lib/engine/risk.ts`).
   */
  single_lot_constrained: boolean;
}

export interface Signal {
  underlying: string;
  protocol: Protocol;
  headline: string;
  rationale: string[];
  actionable: boolean;
  blocked_reason: string | null;
  token: string | null;
  trading_symbol: string | null;
  option_type: OptionType | null;
  strike: number | null;
  itm_depth: number | null;
  entry_price: number | null;
  stop_loss: number | null;
  stop_loss_points: number | null;
  target_1: number | null;
  target_2: number | null;
  quadrant: Quadrant | null;
  sizing: SizingResult | null;
  levels: CoaLevels;
  generated_at: string | null;
}

export interface Position {
  id: string;
  underlying: string;
  token: string;
  trading_symbol: string;
  option_type: OptionType | null;
  strike: number | null;
  side: Side;
  quantity: number;
  lots: number;
  lot_size: number;
  avg_price: number;
  ltp: number;
  /** Index spot at entry — lets a risk guard tell a real move from theta noise. */
  entry_spot: number | null;
  stop_loss: number | null;
  target: number | null;
  unrealised_pnl: number;
  realised_pnl: number;
  pnl_pct: number;
  protocol: Protocol | null;
  opened_at: string;
  closed_at: string | null;
  exit_price: number | null;
  exit_reason: string | null;
  status: "OPEN" | "CLOSED";
  mode: ExecutionMode;
  /** Whether Autopilot or an operator's Execute click opened this position. */
  automation: Automation;
  /** Which broker's session opened this position — stamped server-side, never client-supplied. */
  broker: Broker | null;
}

export interface LedgerSnapshot {
  mode: ExecutionMode;
  capital: number;
  equity: number;
  open_positions: Position[];
  closed_positions: Position[];
  open_pnl: number;
  realised_pnl: number;
  total_pnl: number;
  deployed_margin: number;
  charges: number;
}

export interface RiskEvent {
  ts: string;
  kind:
    | "INVALIDATION"
    | "DAYLIGHT_REST"
    | "STOP_LOSS"
    | "TARGET"
    | "PANIC"
    | "INFO";
  underlying: string | null;
  message: string;
}

export interface SpotQuote {
  underlying: string;
  label: string;
  token: string | null;
  ltp: number;
  prev: number;
  direction: -1 | 0 | 1;
  change: number;
  change_pct: number;
}

/** A position eligible for a manually-triggered scale-in — see `lib/engine/risk.ts`'s `decideScaleIn`. */
export interface ScaleInDecision {
  addLots: number;
  newStop: number;
  newTarget: number | null;
  reason: string;
}

export interface EngineSnapshot {
  ts: string;
  mode: ExecutionMode;
  authenticated: boolean;
  feed_connected: boolean;
  market_open: boolean;
  seconds_to_daylight_rest: number;
  /** Seconds to the next 9:15 AM IST bell — what the clock counts out of hours. */
  seconds_to_open: number;
  spots: Record<string, SpotQuote>;
  chains: Record<string, OptionChain>;
  rrg: Record<string, RrgNode[]>;
  signals: Record<string, Signal>;
  ledger: LedgerSnapshot;
  events: RiskEvent[];
  /** Open position ids currently eligible for a scale-in add — empty when none are. */
  scale_in: Record<string, ScaleInDecision>;
}

/**
 * The operator behind the terminal, as Angel One's `getProfile` describes them.
 *
 * Identity only. Nothing here can trade, and nothing here is a credential — the
 * tokens that are stay in the httpOnly cookie and never reach this object.
 */
export interface UserProfile {
  client_code: string;
  name: string | null;
  email: string | null;
  mobile_no: string | null;
  broker: string | null;
  /** Segments the account is enabled for — NSE, NFO, MCX… */
  exchanges: string[];
  /** Product types the account may use — INTRADAY, DELIVERY, MARGIN… */
  products: string[];
  /** The broker's own last-login stamp, verbatim: its format is not promised. */
  broker_last_login: string | null;
  /** Filled from the persisted row when Supabase has seen this account before. */
  first_seen_at?: string | null;
  logins?: number | null;
  /**
   * The paper wallet's own running totals, persisted on every entry/exit/
   * scale-out — see `Ledger.restoreWallet`. Null for an account that has
   * never traded, in which case the engine seeds from `DEFAULT_CONFIG.paperCapital`.
   */
  paper_capital?: number | null;
  paper_charges?: number | null;
  paper_realised_pnl?: number | null;
}

export interface SessionStatus {
  authenticated: boolean;
  client_code: string | null;
  feed_connected: boolean;
  mode: ExecutionMode;
  login_time: string | null;
  state: string | null;
  message: string | null;
}

export interface OrderResult {
  ok: boolean;
  mode: ExecutionMode;
  order_id: string | null;
  message: string;
  fill_price: number | null;
  quantity: number | null;
  position_id: string | null;
}

export interface EngineStatus {
  mode: ExecutionMode;
  authenticated: boolean;
  simulated: boolean;
  feed_connected: boolean;
  market_open: boolean;
  seconds_to_daylight_rest: number;
  tracked_tokens: number;
  tick_updates: number;
  master_ready: boolean;
  risk_pct: number;
  capital: number;
}

// Sourced from INDEX_UNIVERSE (lib/engine/config.ts) rather than a second
// hardcoded list — this file used to carry its own separate copy, which is
// exactly the kind of drift that let FINNIFTY quietly fall out of step
// across the codebase.
export { UNDERLYINGS } from "./engine/config";
export type Underlying = keyof typeof INDEX_UNIVERSE;

/* ---------------------------------------------------------------- historical */

/**
 * One bar from `getCandleData`. `time` keeps the exchange's own
 * `+05:30`-offset ISO stamp rather than being normalised to UTC — the trading
 * day is an IST construct, and every session boundary here is read off it.
 */
export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** A single trading session, sliced out of a multi-day candle response. */
export interface SessionStats {
  /** IST date the candles belong to, `YYYY-MM-DD`. */
  date: string;
  open: number;
  high: number;
  low: number;
  /** Last traded price of the session so far. */
  close: number;
  /** Previous session's close, when the response reached back far enough. */
  prev_close: number | null;
  change: number | null;
  change_pct: number | null;
  candles: number;
}

/** One point from `getOIData`. */
export interface OiPoint {
  time: string;
  oi: number;
}

/** One row of the market-wide `putCallRatio` response. */
export interface PcrRow {
  pcr: number;
  trading_symbol: string;
  /**
   * Set only on Dhan's derived rows (`lib/market/dhanParse.ts`), which have
   * no futures trading-symbol to parse an underlying out of the way Angel
   * One's do — `pcrForUnderlying` matches this directly when present.
   */
  underlying?: string;
}

/** One row of the `OIBuildup` response, with the numerics parsed. */
export interface OiBuildupRow {
  symbol_token: string;
  trading_symbol: string;
  ltp: number;
  net_change: number;
  percent_change: number;
  open_interest: number;
  oi_change: number;
  /** Set only on Dhan's derived rows — see `PcrRow.underlying`. */
  underlying?: string;
}

/** One leg of a margin-calculator basket. */
export interface MarginPosition {
  exchange: "BSE" | "NSE" | "NFO" | "MCX" | "BFO";
  qty: number;
  price: number;
  productType: "DELIVERY" | "CARRYFORWARD" | "MARGIN" | "INTRADAY" | "BO";
  token: string;
  tradeType: "BUY" | "SELL";
  orderType?: "LIMIT" | "MARKET" | "STOPLOSS_LIMIT" | "STOPLOSS_MARKET";
}

/** What the broker will actually block for a basket. */
export interface MarginEstimate {
  total: number;
  net_premium: number;
  span: number;
  benefit: number;
  delivery: number;
  non_fo: number;
  options_premium: number;
  /** Dhan-only: its calculator returns real per-order brokerage directly, summed across the basket's legs — Angel One's batch endpoint has no equivalent. */
  brokerage?: number;
  /** Dhan-only: exposure margin, summed across legs. */
  exposure?: number;
}

/* ------------------------------------------- market-data route envelopes */

export interface CandleResponse {
  interval: string;
  candles: Candle[];
  /** The most recent trading session inside the requested window. */
  session: Candle[];
  stats: SessionStats | null;
}

export interface OiResponse {
  token: string;
  interval: string;
  series: OiPoint[];
  /** First reading of the window — the session-open baseline for COA 2.0. */
  open_oi: number | null;
  last_oi: number | null;
}

export interface PcrResponse {
  rows: PcrRow[];
  fetched_at: string;
}

/** One contract's session, as the batch route returns it. */
export interface BatchContract {
  token: string;
  bars?: Candle[];
  series?: OiPoint[];
  open_oi?: number | null;
  last_oi?: number | null;
  error?: string;
}

export interface BatchResponse {
  date: string;
  interval: string;
  /** The broker throttled part-way; the remaining contracts were skipped. */
  rate_limited: boolean;
  contracts: BatchContract[];
}

export interface MarginResponse {
  margin: MarginEstimate;
  positions: number;
}

export interface BuildupResponse {
  datatype: string;
  expirytype: string;
  rows: OiBuildupRow[];
  fetched_at: string;
}

/** One row of NSE's F&O trading-holiday calendar. */
export interface Holiday {
  /** ISO, `YYYY-MM-DD`. */
  date: string;
  weekday: string;
  description: string;
}

export interface HolidayResponse {
  holidays: Holiday[];
  fetched_at: string;
}

/**
 * One strike's CE or PE leg, from NSE's own option-chain snapshot.
 * Consumed by `/tools/volatility-desk` only — the Terminal's own
 * closed-market option-chain fallback was removed.
 */
export interface NseOptionLeg {
  strike: number;
  side: "CE" | "PE";
  oi: number;
  changeInOi: number;
  volume: number;
  ltp: number;
}

/**
 * NSE's own option-chain snapshot — a point-in-time read, not a series.
 * Populated only for NSE-listed underlyings (NIFTY/BANKNIFTY/FINNIFTY); BSE
 * has no equivalent public endpoint.
 */
export interface NseOptionChainResponse {
  underlying: string;
  spot: number;
  timestamp: string;
  legs: NseOptionLeg[];
}

