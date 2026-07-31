/**
 * Angel One historical / market-data API vocabulary.
 *
 * Shared by the route handlers and the browser client so both agree on what a
 * legal request is. Nothing here imports `server-only`: the caps below are the
 * same caps the caller has to size its own windows against, and duplicating
 * them would guarantee they drift.
 */

/**
 * Maximum days of data the historical endpoint will return in one request, per
 * interval. Asking for more is rejected upstream, so it is rejected here first
 * with a message that says which cap was hit.
 */
export const INTERVAL_MAX_DAYS = {
  ONE_MINUTE: 30,
  THREE_MINUTE: 60,
  FIVE_MINUTE: 100,
  TEN_MINUTE: 100,
  FIFTEEN_MINUTE: 200,
  THIRTY_MINUTE: 200,
  ONE_HOUR: 400,
  ONE_DAY: 2000,
} as const;

export type HistoricalInterval = keyof typeof INTERVAL_MAX_DAYS;

export const HISTORICAL_INTERVALS = Object.keys(
  INTERVAL_MAX_DAYS,
) as HistoricalInterval[];

/** Segment selector — one endpoint serves them all, this picks which. */
export const HISTORICAL_EXCHANGES = ["NSE", "NFO", "BSE", "BFO", "MCX"] as const;
export type HistoricalExchange = (typeof HISTORICAL_EXCHANGES)[number];

export const OI_BUILDUP_TYPES = [
  "Long Built Up",
  "Short Built Up",
  "Short Covering",
  "Long Unwinding",
] as const;
export type OiBuildupType = (typeof OI_BUILDUP_TYPES)[number];

export const OI_BUILDUP_EXPIRIES = ["NEAR", "NEXT", "FAR"] as const;
export type OiBuildupExpiry = (typeof OI_BUILDUP_EXPIRIES)[number];

/** `YYYY-MM-DD HH:mm`, exchange local time (IST). */
export const STAMP_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;

export function isInterval(value: unknown): value is HistoricalInterval {
  return typeof value === "string" && value in INTERVAL_MAX_DAYS;
}

export function isExchange(value: unknown): value is HistoricalExchange {
  return (
    typeof value === "string" &&
    (HISTORICAL_EXCHANGES as readonly string[]).includes(value)
  );
}

export function isBuildupType(value: unknown): value is OiBuildupType {
  return (
    typeof value === "string" &&
    (OI_BUILDUP_TYPES as readonly string[]).includes(value)
  );
}

export function isBuildupExpiry(value: unknown): value is OiBuildupExpiry {
  return (
    typeof value === "string" &&
    (OI_BUILDUP_EXPIRIES as readonly string[]).includes(value)
  );
}

/**
 * Milliseconds for a naive `YYYY-MM-DD HH:mm` stamp, read as if it were UTC.
 *
 * Both ends of a window carry the same (unstated) IST offset, so pinning them
 * to a fixed zone cancels out and leaves the span correct — while avoiding a
 * parse that would otherwise mean whatever the host's timezone happens to be.
 */
export function stampMs(stamp: string): number | null {
  if (!STAMP_PATTERN.test(stamp)) return null;
  const [date, time] = stamp.split(" ");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31 || hh > 23 || mm > 59) return null;
  const ms = Date.UTC(y, m - 1, d, hh, mm);
  // Date.UTC rolls 31 Feb forward rather than rejecting it.
  const back = new Date(ms);
  if (back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null;
  return ms;
}

export const DAY_MS = 86_400_000;

/** Days spanned by a window, or null if either stamp is malformed. */
export function spanDays(fromdate: string, todate: string): number | null {
  const from = stampMs(fromdate);
  const to = stampMs(todate);
  if (from === null || to === null) return null;
  return (to - from) / DAY_MS;
}
