import { istParts, MARKET_OPEN_MIN } from "@/lib/engine/config";
import { DAY_MS } from "./constants";

/**
 * Request windows, in exchange time.
 *
 * The historical endpoints take naive `YYYY-MM-DD HH:mm` stamps and read them
 * as IST. A browser in London asking for "today 09:15" from its own clock
 * would ask for the wrong session — and at 21:00 IST, for tomorrow's — so
 * every stamp here is derived from the IST wall clock rather than the host's.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** `YYYY-MM-DD` for an instant, in IST. */
export function istDate(at: Date = new Date()): string {
  return istParts(at).date;
}

/** `YYYY-MM-DD HH:mm` for an instant, in IST. */
export function istStamp(at: Date = new Date()): string {
  const p = istParts(at);
  return `${p.date} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** Shift an IST calendar date by whole days, staying in string space. */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d) + days * DAY_MS);
  return [
    shifted.getUTCFullYear(),
    pad(shifted.getUTCMonth() + 1),
    pad(shifted.getUTCDate()),
  ].join("-");
}

export const MARKET_OPEN_STAMP = `${pad(Math.floor(MARKET_OPEN_MIN / 60))}:${pad(
  MARKET_OPEN_MIN % 60,
)}`;

/**
 * A window running from the open, `lookbackDays` sessions back, to now.
 *
 * The lookback is not decoration: it is how a weekend or an exchange holiday
 * is handled without a holiday calendar. The exchange returns no bars for a
 * day it did not trade, so whatever comes back ends on the last real session,
 * and the caller keeps that one.
 */
export function sessionWindow(lookbackDays = 0, at: Date = new Date()) {
  const p = istParts(at);
  const from = `${shiftDate(p.date, -Math.abs(lookbackDays))} ${MARKET_OPEN_STAMP}`;
  const nowMinutes = p.hour * 60 + p.minute;
  // Before the bell there is no session yet; ask to the open so the request
  // stays well-formed and simply returns the previous day's tail.
  const to =
    nowMinutes <= MARKET_OPEN_MIN
      ? `${p.date} ${MARKET_OPEN_STAMP}`
      : `${p.date} ${pad(p.hour)}:${pad(p.minute)}`;
  return { fromdate: from, todate: to };
}
