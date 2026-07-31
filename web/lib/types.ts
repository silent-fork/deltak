/**
 * Wire contracts mirroring `backend/app/schemas.py`.
 * Keep both sides in step — the SSE snapshot is the single payload the HUD renders.
 */

export type ExecutionMode = "paper" | "live";
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

export interface EngineSnapshot {
  ts: string;
  mode: ExecutionMode;
  authenticated: boolean;
  feed_connected: boolean;
  market_open: boolean;
  seconds_to_daylight_rest: number;
  spots: Record<string, SpotQuote>;
  chains: Record<string, OptionChain>;
  rrg: Record<string, RrgNode[]>;
  signals: Record<string, Signal>;
  ledger: LedgerSnapshot;
  events: RiskEvent[];
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

export const UNDERLYINGS = ["NIFTY", "BANKNIFTY", "FINNIFTY"] as const;
export type Underlying = (typeof UNDERLYINGS)[number];
