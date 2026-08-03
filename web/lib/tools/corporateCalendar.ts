import "server-only";

import os from "node:os";

import { NSEClient } from "nse-bse-api";

import { fetchFnoLots } from "@/lib/sectors/fnoLots";
import type { CalendarEvent, RecentIpo } from "./corporateCalendarTypes";

export type { CalendarEvent, RecentIpo } from "./corporateCalendarTypes";

/**
 * "What's landing this week" — board meetings (the closest real signal to a
 * results calendar NSE exposes; a scheduled meeting's own `bm_desc` usually
 * says outright whether it's to consider financial results), corporate
 * actions (dividends/splits/bonuses), and IPO open/close dates, merged into
 * one 7-day list. All three are genuine `nse-bse-api` endpoints confirmed
 * live this session — `corporate.getBoardMeetings`, `corporate.getActions`,
 * `ipo.listCurrentIPO`/`listUpcomingIPO` — not a scrape workaround.
 */

let client: NSEClient | null = null;
function nse(): NSEClient {
  client ??= new NSEClient(os.tmpdir(), { server: true, timeout: 20_000 });
  return client;
}

/** NSE's own `DD-Mon-YYYY` → `YYYY-MM-DD`, or `null` for a blank/"-" field. */
const MONTHS: Record<string, string> = {
  Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06",
  Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12",
};
function parseDdMonYyyy(raw: string | undefined | null): string | null {
  if (!raw || raw === "-") return null;
  const [d, monRaw, y] = raw.split("-");
  const mm = monRaw ? MONTHS[monRaw.slice(0, 1).toUpperCase() + monRaw.slice(1, 3).toLowerCase()] : undefined;
  if (!d || !mm || !y) return null;
  return `${y}-${mm}-${d.padStart(2, "0")}`;
}

interface CacheEntry {
  at: number;
  value: CalendarEvent[];
}
let eventsCache: CacheEntry | null = null;
const EVENTS_TTL_MS = 30 * 60_000;

export async function getUpcomingEvents(): Promise<CalendarEvent[]> {
  if (eventsCache && Date.now() - eventsCache.at < EVENTS_TTL_MS) return eventsCache.value;

  const today = new Date();
  const weekAhead = new Date();
  weekAhead.setDate(weekAhead.getDate() + 7);

  const events: CalendarEvent[] = [];

  try {
    const meetings = (await nse().corporate.getBoardMeetings({
      fno: true,
      from_date: today,
      to_date: weekAhead,
    })) as { bm_symbol?: string; bm_date?: string; bm_desc?: string; bm_purpose?: string; sm_name?: string }[];
    for (const m of meetings) {
      const date = parseDdMonYyyy(m.bm_date);
      const symbol = m.bm_symbol?.trim();
      if (!date || !symbol) continue;
      const isResults = /financial results?/i.test(m.bm_desc ?? "");
      events.push({
        date,
        type: "RESULTS",
        symbol,
        company: m.sm_name ?? symbol,
        description: isResults ? "Board meeting — financial results" : m.bm_purpose ?? "Board meeting",
        fno: true,
      });
    }
  } catch {
    // One source failing degrades the calendar, not the whole page.
  }

  try {
    const [actions, lots] = await Promise.all([
      nse().corporate.getActions({ from_date: today, to_date: weekAhead }) as Promise<
        { symbol?: string; comp?: string; exDate?: string; subject?: string }[]
      >,
      fetchFnoLots(),
    ]);
    for (const a of actions) {
      const symbol = a.symbol?.trim();
      if (!symbol || !(symbol in lots)) continue;
      const date = parseDdMonYyyy(a.exDate);
      if (!date) continue;
      events.push({
        date,
        type: "ACTION",
        symbol,
        company: a.comp ?? symbol,
        description: a.subject ?? "Corporate action",
        fno: true,
      });
    }
  } catch {
    // Same — a partial calendar beats none.
  }

  try {
    const [current, upcoming] = await Promise.all([
      nse().ipo.listCurrentIPO() as Promise<
        { symbol?: string; companyName?: string; issueStartDate?: string; issueEndDate?: string }[]
      >,
      nse().ipo.listUpcomingIPO() as Promise<
        { symbol?: string; companyName?: string; issueStartDate?: string; issueEndDate?: string }[]
      >,
    ]);
    for (const ipo of [...current, ...upcoming]) {
      const symbol = ipo.symbol?.trim();
      const company = ipo.companyName ?? symbol;
      if (!symbol || !company) continue;
      const opens = parseDdMonYyyy(ipo.issueStartDate);
      const closes = parseDdMonYyyy(ipo.issueEndDate);
      if (opens) {
        events.push({ date: opens, type: "IPO", symbol, company, description: "IPO opens", fno: false });
      }
      if (closes) {
        events.push({ date: closes, type: "IPO", symbol, company, description: "IPO closes", fno: false });
      }
    }
  } catch {
    // Same again.
  }

  // NSE occasionally returns a revised filing as a second, near-identical
  // row (confirmed live: duplicate board-meeting rows for the same
  // symbol/date/purpose) — collapse those. IPO listings also aren't
  // date-ranged the way the board-meeting/action calls are, so "current"
  // IPOs that already opened before today can carry an open-date in the
  // past; both get clamped to the same 7-day, today-forward window this
  // calendar actually claims to show.
  const todayIso = today.toISOString().slice(0, 10);
  const weekAheadIso = weekAhead.toISOString().slice(0, 10);
  const seen = new Set<string>();
  const deduped: CalendarEvent[] = [];
  for (const e of events) {
    if (e.date < todayIso || e.date > weekAheadIso) continue;
    const key = `${e.date}|${e.type}|${e.symbol}|${e.description}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(e);
  }
  deduped.sort((a, b) => a.date.localeCompare(b.date));

  eventsCache = { at: Date.now(), value: deduped };
  return deduped;
}

interface IpoCacheEntry {
  at: number;
  value: RecentIpo[];
}
let ipoCache: IpoCacheEntry | null = null;
const IPO_TTL_MS = 60 * 60_000;

export async function getRecentIpos(): Promise<RecentIpo[]> {
  if (ipoCache && Date.now() - ipoCache.at < IPO_TTL_MS) return ipoCache.value;

  try {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 60);
    const rows = (await nse().ipo.listPastIPO(from, to)) as {
      symbol?: string;
      company?: string;
      priceRange?: string;
      issuePrice?: string;
      listingDate?: string;
    }[];
    const seen = new Set<string>();
    const value: RecentIpo[] = [];
    for (const r of rows) {
      const symbol = r.symbol?.trim();
      if (!symbol || seen.has(symbol)) continue;
      seen.add(symbol);
      value.push({
        symbol,
        company: r.company ?? symbol,
        priceLabel: r.priceRange && r.priceRange !== "-" ? r.priceRange : (r.issuePrice ?? "—"),
        listingDate: parseDdMonYyyy(r.listingDate),
      });
      if (value.length >= 8) break;
    }
    ipoCache = { at: Date.now(), value };
    return value;
  } catch {
    ipoCache = { at: Date.now(), value: [] };
    return [];
  }
}
