import {
  INTERVAL_MAX_DAYS,
  STAMP_PATTERN,
  isExchange,
  isInterval,
  spanDays,
  type HistoricalExchange,
  type HistoricalInterval,
} from "./constants";

/**
 * Request validation for the two historical endpoints.
 *
 * The body is rebuilt field by field rather than forwarded: these routes carry
 * a session JWT, so anything the caller sends reaches Angel One with the
 * operator's credentials attached. Only the five documented fields, in the
 * documented shapes, get through — and the day caps are enforced here so a bad
 * window fails locally with a message naming the cap, instead of burning a
 * metered upstream call to be told the same thing.
 */

export interface HistoricalRequest {
  exchange: HistoricalExchange;
  symboltoken: string;
  interval: HistoricalInterval;
  fromdate: string;
  todate: string;
}

export type Parsed =
  | { ok: true; body: HistoricalRequest }
  | { ok: false; detail: string };

const TOKEN_PATTERN = /^\d{1,12}$/;

export function parseHistoricalBody(raw: unknown): Parsed {
  if (!raw || typeof raw !== "object") {
    return { ok: false, detail: "Expected a JSON request body." };
  }
  const body = raw as Record<string, unknown>;

  if (!isExchange(body.exchange)) {
    return {
      ok: false,
      detail: "exchange must be one of NSE, NFO, BSE, BFO, MCX.",
    };
  }
  const symboltoken = String(body.symboltoken ?? "").trim();
  if (!TOKEN_PATTERN.test(symboltoken)) {
    return { ok: false, detail: "symboltoken must be a numeric scrip token." };
  }
  if (!isInterval(body.interval)) {
    return {
      ok: false,
      detail: `interval must be one of ${Object.keys(INTERVAL_MAX_DAYS).join(", ")}.`,
    };
  }
  const fromdate = String(body.fromdate ?? "");
  const todate = String(body.todate ?? "");
  if (!STAMP_PATTERN.test(fromdate) || !STAMP_PATTERN.test(todate)) {
    return { ok: false, detail: "fromdate and todate must be 'YYYY-MM-DD HH:mm'." };
  }

  const span = spanDays(fromdate, todate);
  if (span === null) {
    return { ok: false, detail: "fromdate or todate is not a real date." };
  }
  if (span < 0) {
    return { ok: false, detail: "fromdate must not be after todate." };
  }

  const cap = INTERVAL_MAX_DAYS[body.interval];
  if (span > cap) {
    return {
      ok: false,
      detail: `${body.interval} allows at most ${cap} days per request; asked for ${span.toFixed(1)}.`,
    };
  }

  return {
    ok: true,
    body: {
      exchange: body.exchange,
      symboltoken,
      interval: body.interval,
      fromdate,
      todate,
    },
  };
}

/** Body → JSON, or null when the caller sent something unparseable. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
