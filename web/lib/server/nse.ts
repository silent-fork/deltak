import "server-only";

import os from "node:os";

import { NSEClient } from "nse-bse-api";

import type { Holiday, NseOptionChainResponse, NseOptionLeg } from "@/lib/types";

/**
 * NSE's own public holiday calendar — not Angel One.
 *
 * `nse-bse-api` scrapes nseindia.com's consumer website; it is not an
 * endpoint either exchange documents for programmatic use, carries no
 * SmartAPI credentials, and has no SLA the way the broker's own REST API
 * does. Used here for exactly one read-only, low-frequency thing this app
 * has no other source for: the F&O trading-holiday calendar, so the header's
 * "next open" countdown can eventually account for a Muhurat-style closure
 * instead of counting down to a bell that never rings (see the comments on
 * `secondsToNextOpen` in `lib/engine/config.ts`) — the calendar is
 * surfaced today, not yet wired into that countdown.
 *
 * `server: true` skips the disk-based cookie priming the package otherwise
 * does for browser-style scraping — appropriate here since a serverless
 * function's `/tmp` does not reliably survive between invocations anyway.
 */
let client: NSEClient | null = null;

function nse(): NSEClient {
  client ??= new NSEClient(os.tmpdir(), { server: true, timeout: 8_000 });
  return client;
}

const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};

/** NSE's own `DD-Mon-YYYY` → `YYYY-MM-DD`. */
function toIsoDate(tradingDate: string): string | null {
  const [d, mon, y] = tradingDate.split("-");
  const mm = MONTHS[mon];
  if (!d || !mm || !y) return null;
  return `${y}-${mm}-${d.padStart(2, "0")}`;
}

/**
 * Upcoming F&O holidays, nearest first.
 *
 * NSE keys its holiday list by segment (CM, FO, CD, ...); the standard
 * calendar holidays are identical across CM and FO (confirmed against a live
 * fetch), so FO — the segment this app actually trades — is read directly
 * rather than picking an arbitrary one.
 */
export async function fetchUpcomingHolidays(): Promise<Holiday[]> {
  const raw = (await nse().market.getHolidays("trading")) as Record<
    string,
    { tradingDate: string; weekDay: string; description: string }[]
  >;
  const rows = raw?.FO ?? raw?.CM ?? [];
  const today = new Date().toISOString().slice(0, 10);

  return rows
    .map((r) => {
      const date = toIsoDate(r.tradingDate);
      return date ? { date, weekday: r.weekDay, description: r.description } : null;
    })
    .filter((h): h is Holiday => h !== null && h.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
}

interface RawOptionLeg {
  strikePrice?: number;
  openInterest?: number;
  changeinOpenInterest?: number;
  totalTradedVolume?: number;
  lastPrice?: number;
}

interface RawOptionRow {
  strikePrice?: number;
  CE?: RawOptionLeg;
  PE?: RawOptionLeg;
}

/**
 * NSE's own option-chain snapshot — a single point-in-time read (whatever
 * NSE last computed), never a series. Confirmed live that this still serves
 * the last session's numbers after the 15:30 close rather than erroring, so
 * it stands in for exactly what a closed market has no fresher number for:
 * each strike's OI, its change since the session's own open, volume and
 * last price, plus the underlying's own last value.
 *
 * NSE-listed underlyings only ("NIFTY", "BANKNIFTY", "FINNIFTY" — the same
 * strings this app already uses as `Underlying` keys, which is also NSE's
 * own symbol convention for its index option chains). BSE has no equivalent
 * endpoint in this package, so BANKEX/SENSEX are the caller's responsibility
 * to exclude before calling this.
 */
export async function fetchOptionChainSnapshot(
  underlying: string,
): Promise<NseOptionChainResponse> {
  const raw = (await nse().options.getOptionChain(underlying)) as {
    records?: {
      data?: RawOptionRow[];
      underlyingValue?: number;
      timestamp?: string;
    };
  };

  const legs: NseOptionLeg[] = [];
  for (const row of raw?.records?.data ?? []) {
    for (const side of ["CE", "PE"] as const) {
      const leg = row[side];
      const strike = row.strikePrice ?? leg?.strikePrice;
      if (!leg || !strike) continue;
      legs.push({
        strike,
        side,
        oi: leg.openInterest ?? 0,
        changeInOi: leg.changeinOpenInterest ?? 0,
        volume: leg.totalTradedVolume ?? 0,
        ltp: leg.lastPrice ?? 0,
      });
    }
  }

  return {
    underlying,
    spot: raw?.records?.underlyingValue ?? 0,
    timestamp: raw?.records?.timestamp ?? "",
    legs,
  };
}
