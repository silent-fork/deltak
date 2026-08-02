import type { Automation, ExecutionMode, OptionType, Position, Protocol, Side } from "@/lib/types";

/**
 * Engine objects → Supabase rows.
 *
 * The ledger's `Position` and the `positions` table are not the same shape, and
 * posting one as the other is why nothing was ever written: PostgREST rejects a
 * whole batch over a single unknown key, and `Position.id` — `DK-142233-004`,
 * not a bigint — was on every payload. The engine kept trading, the writes kept
 * failing, and because persistence is fire-and-forget nobody heard about it.
 *
 * So the mapping is explicit and lives here, in one pure function per table,
 * where a test can hold it to the schema.
 *
 * Attribution is *not* set here. `client_code` and `trade_key` are stamped by
 * the persist route from the session cookie, because a browser should not get
 * to name the account a trade belongs to.
 */

/**
 * The columns each table actually has.
 *
 * The persist route projects every incoming row onto these before it reaches
 * PostgREST, which rejects a *whole batch* over one unknown key. Keeping the
 * list beside the mappers is what lets a test hold the two together — and keeps
 * it out of the `server-only` module, where nothing but the server could read
 * it.
 *
 * `client_code` and `trade_key` are stamped server-side from the session
 * cookie; they are listed because the row is projected after that stamp.
 */
export const TABLE_COLUMNS = {
  positions: [
    "client_code", "trade_key", "ledger_id", "mode", "underlying", "token",
    "trading_symbol", "option_type", "strike", "side", "quantity", "lots",
    "lot_size", "avg_price", "ltp", "entry_spot", "stop_loss", "target", "protocol",
    "status", "unrealised_pnl", "realised_pnl", "pnl_pct", "exit_price", "exit_reason",
    "opened_at", "closed_at", "automation",
  ],
  orders: [
    "client_code", "mode", "underlying", "token", "trading_symbol",
    "transaction_type", "order_type", "quantity", "lots", "lot_size", "price",
    "fill_price", "status", "broker_order_id", "ledger_id", "protocol",
    "option_type", "strike", "message",
  ],
  events: ["ts", "kind", "underlying", "message"],
} as const satisfies Record<string, readonly string[]>;

export interface PositionRow {
  /** The ledger's own id, kept for tracing a row back to a session's book. */
  ledger_id: string;
  mode: ExecutionMode;
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
  ltp: number | null;
  entry_spot: number | null;
  stop_loss: number | null;
  target: number | null;
  protocol: Protocol | null;
  status: "OPEN" | "CLOSED";
  unrealised_pnl: number;
  realised_pnl: number;
  pnl_pct: number;
  exit_price: number | null;
  exit_reason: string | null;
  opened_at: string;
  closed_at: string | null;
  automation: Automation;
}

export interface OrderRow {
  mode: ExecutionMode;
  underlying: string;
  token: string;
  trading_symbol: string;
  transaction_type: Side;
  order_type: string;
  quantity: number;
  lots: number | null;
  lot_size: number | null;
  price: number | null;
  fill_price: number | null;
  status: "ACCEPTED" | "REJECTED";
  broker_order_id: string | null;
  ledger_id: string | null;
  protocol: Protocol | null;
  option_type: OptionType | null;
  strike: number | null;
  message: string | null;
}

/**
 * The engine stamps times as `2026-08-01T14:22:33` — UTC, with the marker
 * dropped by `slice(19)`. Postgres would read a bare stamp against whatever the
 * connection's time zone happens to be, so the marker goes back on: an entry
 * five and a half hours out is worse than no entry at all in a book whose every
 * rule is keyed to IST.
 */
export function utcStamp(value: string | null | undefined): string | null {
  if (!value) return null;
  return /[Zz]|[+-]\d{2}:?\d{2}$/.test(value) ? value : `${value}Z`;
}

export function positionRow(p: Position): PositionRow {
  return {
    ledger_id: p.id,
    mode: p.mode,
    underlying: p.underlying,
    token: p.token,
    trading_symbol: p.trading_symbol,
    option_type: p.option_type,
    strike: p.strike,
    side: p.side,
    quantity: p.quantity,
    lots: p.lots,
    lot_size: p.lot_size,
    avg_price: p.avg_price,
    ltp: p.ltp,
    entry_spot: p.entry_spot,
    stop_loss: p.stop_loss,
    target: p.target,
    protocol: p.protocol,
    status: p.status,
    unrealised_pnl: p.unrealised_pnl,
    realised_pnl: p.realised_pnl,
    pnl_pct: p.pnl_pct,
    exit_price: p.exit_price,
    exit_reason: p.exit_reason,
    // Non-null by construction, and the upsert key depends on it: a position
    // with no open time would collide with every other one that had none.
    opened_at: utcStamp(p.opened_at) ?? new Date().toISOString(),
    closed_at: utcStamp(p.closed_at),
    automation: p.automation,
  };
}

/**
 * One executed leg, as an order row.
 *
 * Entries, scale-outs and exits are all orders; a rejected live exit is one too,
 * and is the row an operator most wants to find afterwards — it is the moment
 * the book and the broker stopped agreeing.
 */
export function orderRow(params: {
  position: Pick<
    Position,
    | "id"
    | "mode"
    | "underlying"
    | "token"
    | "trading_symbol"
    | "option_type"
    | "strike"
    | "protocol"
    | "lot_size"
  >;
  transactionType: Side;
  quantity: number;
  lots?: number | null;
  fillPrice?: number | null;
  status: "ACCEPTED" | "REJECTED";
  brokerOrderId?: string | null;
  message?: string | null;
}): OrderRow {
  const p = params.position;
  return {
    mode: p.mode,
    underlying: p.underlying,
    token: p.token,
    trading_symbol: p.trading_symbol,
    transaction_type: params.transactionType,
    // Every order this engine places is a market order; the column exists for
    // the day that stops being true.
    order_type: "MARKET",
    quantity: params.quantity,
    lots: params.lots ?? null,
    lot_size: p.lot_size,
    // A market order has no limit price. What it got is the fill.
    price: null,
    fill_price: params.fillPrice ?? null,
    status: params.status,
    broker_order_id: params.brokerOrderId ?? null,
    ledger_id: p.id,
    protocol: p.protocol,
    option_type: p.option_type,
    strike: p.strike,
    message: params.message ?? null,
  };
}
