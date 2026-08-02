import "server-only";

import { INDEX_UNIVERSE, SCRIP_MASTER_URL } from "@/lib/engine/config";
import { parseExpiry } from "@/lib/engine/scripMaster";

/**
 * The public expiry calendar tool's data source.
 *
 * No broker session involved: the scrip master Angel One publishes at
 * `SCRIP_MASTER_URL` is a public file listing every tradable contract,
 * expiry included, and it's the same file `/api/master` already downloads
 * for the signed-in terminal. That makes it the exchange's own source of
 * truth for which dates actually expire — a holiday shift or an NSE change
 * to which weekday carries the monthly expiry (both have happened before)
 * shows up here the next time the file is fetched, with no calendar of our
 * own to keep in sync by hand.
 */

export interface ExpiryEntry {
  /** ISO calendar date, e.g. "2026-08-05". */
  date: string;
  weekday: string;
  kind: "Weekly" | "Monthly";
  daysToExpiry: number;
}

export interface ExpiryCalendar {
  generatedAt: string;
  underlyings: Record<string, ExpiryEntry[]>;
}

/** A few months of weeklies is plenty for a page anyone would actually read. */
const FORWARD_DEPTH = 12;

interface RawRow {
  name?: string;
  expiry?: string;
  instrumenttype?: string;
  exch_seg?: string;
}

function weekdayOf(isoDate: string): string {
  // Treated as UTC midnight purely to ask "what weekday is this calendar
  // date" without a server-local timezone shifting it to the day before.
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
}

export async function getExpiryCalendar(): Promise<ExpiryCalendar> {
  const res = await fetch(SCRIP_MASTER_URL, { next: { revalidate: 3600 } });
  if (!res.ok) {
    throw new Error(`Scrip master download failed (HTTP ${res.status}).`);
  }
  const rows = (await res.json()) as RawRow[];

  const byUnderlying: Record<string, Set<string>> = {};
  for (const row of rows) {
    if ((row.exch_seg ?? "").toUpperCase() !== "NFO") continue;
    if ((row.instrumenttype ?? "").toUpperCase() !== "OPTIDX") continue;
    const underlying = (row.name ?? "").trim().toUpperCase();
    if (!(underlying in INDEX_UNIVERSE)) continue;
    const expiry = parseExpiry(row.expiry ?? "");
    if (!expiry) continue;
    (byUnderlying[underlying] ??= new Set()).add(expiry);
  }

  const today = new Date().toISOString().slice(0, 10);
  const monthOf = (d: string) => d.slice(0, 7);
  const underlyings: Record<string, ExpiryEntry[]> = {};

  for (const underlying of Object.keys(INDEX_UNIVERSE)) {
    const all = [...(byUnderlying[underlying] ?? [])].sort();

    // Whichever expiry is the last one landing inside its own calendar
    // month is the monthly one — read off the data instead of assuming a
    // fixed weekday, so this keeps working the next time NSE moves it.
    const lastInMonth = new Map<string, string>();
    for (const d of all) lastInMonth.set(monthOf(d), d);

    underlyings[underlying] = all
      .filter((d) => d >= today)
      .slice(0, FORWARD_DEPTH)
      .map((d) => ({
        date: d,
        weekday: weekdayOf(d),
        kind: lastInMonth.get(monthOf(d)) === d ? "Monthly" : "Weekly",
        daysToExpiry: Math.max(
          0,
          Math.round((Date.parse(`${d}T15:30:00+05:30`) - Date.now()) / 86_400_000),
        ),
      }));
  }

  return { generatedAt: new Date().toISOString(), underlyings };
}
