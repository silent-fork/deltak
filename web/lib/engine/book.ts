import type { LedgerSnapshot, OptionType, Position, Protocol, Side } from "@/lib/types";

/**
 * A `positions` row, as PostgREST hands it back — Supabase's own record, not
 * the in-browser ledger's. Numeric columns can arrive as JSON numbers or as
 * strings depending on precision, so every field is read defensively rather
 * than trusted to already be the right type.
 */
export type ArchiveRow = Record<string, unknown>;

const asStr = (v: unknown): string => (typeof v === "string" ? v : String(v ?? ""));
const asStrOrNull = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);
const asNum = (v: unknown, fallback = 0): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const asNumOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * A persisted row as the same `Position` shape the live ledger renders — so
 * the archive tab draws through the exact card the open/history tabs do,
 * rather than a second implementation that could drift from it.
 */
export function archiveRowToPosition(row: ArchiveRow): Position {
  return {
    // `ledger_id` first, not the Postgres row id: the live ledger's own
    // `Position.id` is the ledger id, and the merge below dedupes a DB
    // checkpoint against its live counterpart by matching this field. Falling
    // back to the bigint PK here would make every open position's own
    // persisted copy look like a second, unrelated position.
    id: asStr(row.ledger_id ?? row.trade_key ?? row.id),
    underlying: asStr(row.underlying),
    token: asStr(row.token),
    trading_symbol: asStr(row.trading_symbol),
    option_type: (row.option_type as OptionType | null) ?? null,
    strike: asNumOrNull(row.strike),
    side: (row.side as Side) ?? "BUY",
    quantity: asNum(row.quantity),
    lots: asNum(row.lots),
    lot_size: asNum(row.lot_size),
    avg_price: asNum(row.avg_price),
    ltp: asNum(row.ltp, asNum(row.avg_price)),
    entry_spot: asNumOrNull(row.entry_spot),
    stop_loss: asNumOrNull(row.stop_loss),
    target: asNumOrNull(row.target),
    unrealised_pnl: asNum(row.unrealised_pnl),
    realised_pnl: asNum(row.realised_pnl),
    pnl_pct: asNum(row.pnl_pct),
    protocol: (row.protocol as Protocol | null) ?? null,
    opened_at: asStr(row.opened_at),
    closed_at: asStrOrNull(row.closed_at),
    exit_price: asNumOrNull(row.exit_price),
    exit_reason: asStrOrNull(row.exit_reason),
    status: row.status === "CLOSED" ? "CLOSED" : "OPEN",
    mode: (row.mode as Position["mode"]) ?? "paper",
  };
}

export interface BookRow {
  position: Position;
  /** A persisted row from another (or a since-reloaded) session — nothing here can act on it. */
  readOnly: boolean;
}

export interface MergedBook {
  openRows: BookRow[];
  closedRows: BookRow[];
  /** Live + archived open positions' unrealised P&L — what "Open" means on screen. */
  openPnl: number;
  /** Live + archived closed positions' realised P&L, spanning every session. */
  bookedPnl: number;
  /** Live + archived open positions' notional — what is actually deployed right now. */
  deployedMargin: number;
}

/**
 * The live ledger and the Supabase archive, as one book.
 *
 * The engine wins wherever it still holds a position, because it is more
 * current than any checkpoint and is the only thing left a position card can
 * actually act on. A Supabase row with no live counterpart is one no object
 * in this tab knows about anymore — closed in a different browser, or open in
 * a session this reload just lost — and is shown, but read-only. Positions
 * with no live match to fall back on would otherwise vanish the moment a tab
 * refreshes, and every header total derived from the live ledger alone would
 * read zero the moment a fresh tab replaced the one that actually traded.
 */
export function mergeBook(
  ledger: LedgerSnapshot | undefined,
  archive: Position[] | null,
): MergedBook {
  const open = ledger?.open_positions ?? [];
  // Newest first: the trade you just closed is the one you want to see.
  const closed = ledger ? [...ledger.closed_positions].reverse() : [];

  const openIds = new Set(open.map((p) => p.id));
  const closedIds = new Set(closed.map((p) => p.id));
  const dbOpen = (archive ?? []).filter((p) => p.status === "OPEN" && !openIds.has(p.id));
  const dbClosed = (archive ?? [])
    .filter((p) => p.status === "CLOSED" && !closedIds.has(p.id))
    .sort((a, b) => (b.closed_at ?? b.opened_at).localeCompare(a.closed_at ?? a.opened_at));

  const openRows: BookRow[] = [
    ...open.map((p) => ({ position: p, readOnly: false })),
    ...dbOpen.map((p) => ({ position: p, readOnly: true })),
  ];
  const closedRows: BookRow[] = [
    ...closed.map((p) => ({ position: p, readOnly: false })),
    ...dbClosed.map((p) => ({ position: p, readOnly: true })),
  ];

  const openPnl = openRows.reduce((a, r) => a + r.position.unrealised_pnl, 0);
  const bookedPnl = closedRows.reduce((a, r) => a + r.position.realised_pnl, 0);
  const deployedMargin = openRows.reduce(
    (a, r) => a + r.position.avg_price * r.position.quantity,
    0,
  );

  return { openRows, closedRows, openPnl, bookedPnl, deployedMargin };
}
