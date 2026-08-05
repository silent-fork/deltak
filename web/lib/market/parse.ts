import type {
  Candle,
  OiBuildupRow,
  OiPoint,
  PcrRow,
  SessionStats,
} from "@/lib/types";

/**
 * Normalisers for the Angel One historical and market-data payloads.
 *
 * Every one of these endpoints quotes numbers as strings in at least one field
 * (`OIBuildup` quotes all of them) and `getCandleData` returns positional
 * tuples rather than objects. Parsing lives here, in one pure module, so the
 * route handlers stay thin and the shapes are unit-testable without a network.
 */

const num = (value: unknown): number => {
  const n = typeof value === "string" ? Number(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
};

/** `[time, open, high, low, close, volume]` tuples → named bars. */
export function parseCandles(data: unknown): Candle[] {
  if (!Array.isArray(data)) return [];
  const out: Candle[] = [];
  for (const row of data) {
    if (!Array.isArray(row) || row.length < 6) continue;
    const time = String(row[0] ?? "");
    if (!time) continue;
    out.push({
      time,
      open: num(row[1]),
      high: num(row[2]),
      low: num(row[3]),
      close: num(row[4]),
      volume: num(row[5]),
    });
  }
  // The exchange returns bars oldest-first; sort defensively so consumers that
  // slice off "the session" cannot be handed a reversed page.
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export function parseOiSeries(data: unknown): OiPoint[] {
  if (!Array.isArray(data)) return [];
  const out: OiPoint[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const time = String(r.time ?? "");
    if (!time) continue;
    out.push({ time, oi: num(r.oi) });
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

export function parsePcrRows(data: unknown): PcrRow[] {
  if (!Array.isArray(data)) return [];
  const out: PcrRow[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const symbol = String(r.tradingSymbol ?? "").trim().toUpperCase();
    if (!symbol) continue;
    out.push({ pcr: num(r.pcr), trading_symbol: symbol });
  }
  return out;
}

export function parseBuildupRows(data: unknown): OiBuildupRow[] {
  if (!Array.isArray(data)) return [];
  const out: OiBuildupRow[] = [];
  for (const row of data) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const symbol = String(r.tradingSymbol ?? "").trim().toUpperCase();
    if (!symbol) continue;
    out.push({
      symbol_token: String(r.symbolToken ?? ""),
      trading_symbol: symbol,
      ltp: num(r.ltp),
      net_change: num(r.netChange),
      percent_change: num(r.percentChange),
      open_interest: num(r.opnInterest),
      oi_change: num(r.netChangeOpnInterest),
    });
  }
  return out;
}

/* ------------------------------------------------------------- sessions */

/** IST calendar date of a candle stamp (`2024-08-19T09:15:00+05:30`). */
export function candleDate(candle: Candle): string {
  return candle.time.slice(0, 10);
}

/**
 * The most recent trading session inside a multi-day response.
 *
 * Requesting "the last five days" and keeping whichever date actually came
 * back is how the terminal survives weekends and exchange holidays without
 * carrying a holiday calendar: the exchange simply does not return bars for a
 * day it did not trade.
 */
export function sessionSlice(candles: Candle[]): {
  session: Candle[];
  stats: SessionStats | null;
} {
  if (!candles.length) return { session: [], stats: null };

  const date = candleDate(candles[candles.length - 1]);
  const session = candles.filter((c) => candleDate(c) === date);
  if (!session.length) return { session: [], stats: null };

  // Last close before today's first bar — the reference every change% here is
  // quoted against, and the only correct one before the feed sends its own.
  const earlier = candles.filter((c) => candleDate(c) < date);
  const prevClose = earlier.length ? earlier[earlier.length - 1].close : null;

  const close = session[session.length - 1].close;
  const stats: SessionStats = {
    date,
    open: session[0].open,
    high: Math.max(...session.map((c) => c.high)),
    low: Math.min(...session.map((c) => c.low)),
    close,
    prev_close: prevClose,
    change: prevClose ? Number((close - prevClose).toFixed(2)) : null,
    change_pct: prevClose
      ? Number((((close - prevClose) / prevClose) * 100).toFixed(2))
      : null,
    candles: session.length,
  };
  return { session, stats };
}

/* ------------------------------------------------------------------ pcr */

/**
 * PCR is published against the underlying's *futures* symbol
 * (`NIFTY29AUG24FUT`), so an index maps to several rows — one per live expiry.
 * The near expiry is the one the option chain here trades, so that is the row
 * taken; anchoring the pattern keeps `NIFTY` from swallowing `BANKNIFTY`.
 */
const FUT_PATTERN = /^([A-Z]+)(\d{2})([A-Z]{3})(\d{2})FUT$/;

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

/** Sortable `YYYY-MM-DD` for a futures trading symbol, or null. */
export function futuresExpiry(symbol: string): string | null {
  const m = FUT_PATTERN.exec(symbol.toUpperCase());
  if (!m) return null;
  const month = MONTHS[m[3]];
  if (!month) return null;
  return `20${m[4]}-${String(month).padStart(2, "0")}-${m[2]}`;
}

/**
 * True when one `OIBuildup` class's rows include the underlying's near-month
 * futures contract. The endpoint is called once per class (Long/Short Built
 * Up, Short Covering, Long Unwinding); whichever call's rows contain the
 * contract is the class it currently sits in.
 */
export function buildupIncludesUnderlying(rows: OiBuildupRow[], underlying: string): boolean {
  const want = underlying.toUpperCase();
  return rows.some(
    (r) =>
      (r.underlying?.toUpperCase() ?? FUT_PATTERN.exec(r.trading_symbol.toUpperCase())?.[1]) ===
      want,
  );
}

export function pcrForUnderlying(
  rows: PcrRow[],
  underlying: string,
  today = new Date().toISOString().slice(0, 10),
): PcrRow | null {
  const want = underlying.toUpperCase();

  // Dhan's derived rows carry the underlying directly — one row per
  // underlying, no futures-expiry disambiguation to do.
  const tagged = rows.find((r) => r.underlying?.toUpperCase() === want);
  if (tagged) return tagged;

  const matches = rows
    .map((row) => ({ row, expiry: futuresExpiry(row.trading_symbol) }))
    .filter(
      (m) => FUT_PATTERN.exec(m.row.trading_symbol)?.[1] === want && m.expiry,
    )
    .sort((a, b) => a.expiry!.localeCompare(b.expiry!));

  if (!matches.length) return null;
  return (matches.find((m) => m.expiry! >= today) ?? matches[0]).row;
}
