import "server-only";

import fs from "node:fs";
import os from "node:os";

import { NSEClient } from "nse-bse-api";

/**
 * One day's close (and prior close) for every NSE-listed equity — a single
 * bulk CSV download, the same shape of source as `bhavcopy.ts` uses for
 * sector indices.
 *
 * This exists instead of calling `historical.fetchEquityHistoricalData` once
 * per stock: that per-symbol endpoint hits nseindia.com's live API and
 * proved unreliable under any real load — confirmed live, it started
 * returning a flat 403 on every symbol after a run of only a few dozen
 * calls in the same session, while this same bulk bhavcopy download kept
 * working throughout. One request for the whole market is also just less
 * work than one request per constituent.
 */
export interface EquityClose {
  symbol: string;
  close: number;
  prevClose: number;
  changePct: number;
  /** Total traded value for the session, in rupees — a liquidity/activity weight. */
  turnover: number;
}

export type EquityCloses = Map<string, EquityClose>;

/** One session's high/low for every equity — the range-radar's raw material. */
export interface EquityDayRange {
  symbol: string;
  high: number;
  low: number;
}

export type EquityDayRanges = Map<string, EquityDayRange>;

let client: NSEClient | null = null;
function nse(): NSEClient {
  client ??= new NSEClient(os.tmpdir(), { server: true, timeout: 20_000 });
  return client;
}

interface Cols {
  seriesIdx: number;
  symIdx: number;
  closeIdx: number;
  prevIdx: number;
  turnoverIdx: number;
  highIdx: number;
  lowIdx: number;
}

function findCols(header: string[]): Cols {
  return {
    seriesIdx: header.indexOf("SctySrs"),
    symIdx: header.indexOf("TckrSymb"),
    closeIdx: header.indexOf("ClsPric"),
    prevIdx: header.indexOf("PrvsClsgPric"),
    turnoverIdx: header.indexOf("TtlTrfVal"),
    highIdx: header.indexOf("HghPric"),
    lowIdx: header.indexOf("LwPric"),
  };
}

function parse(text: string): EquityCloses {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return new Map();

  const c = findCols(lines[0]!.split(","));
  if ([c.seriesIdx, c.symIdx, c.closeIdx, c.prevIdx].some((i) => i < 0)) return new Map();

  const closes: EquityCloses = new Map();
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    // "EQ" is the ordinary equity series — bonds, ETFs and other instrument
    // types share this same bhavcopy file under other series codes.
    if (cols[c.seriesIdx] !== "EQ") continue;
    const symbol = cols[c.symIdx]?.trim();
    const close = Number(cols[c.closeIdx]);
    const prevClose = Number(cols[c.prevIdx]);
    if (!symbol || !Number.isFinite(close) || !Number.isFinite(prevClose) || prevClose <= 0) {
      continue;
    }
    const turnover = c.turnoverIdx >= 0 ? Number(cols[c.turnoverIdx]) : NaN;
    closes.set(symbol, {
      symbol,
      close,
      prevClose,
      changePct: ((close - prevClose) / prevClose) * 100,
      turnover: Number.isFinite(turnover) ? turnover : 0,
    });
  }
  return closes;
}

function parseRanges(text: string): EquityDayRanges {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return new Map();

  const c = findCols(lines[0]!.split(","));
  if ([c.seriesIdx, c.symIdx, c.highIdx, c.lowIdx].some((i) => i < 0)) return new Map();

  const ranges: EquityDayRanges = new Map();
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    if (cols[c.seriesIdx] !== "EQ") continue;
    const symbol = cols[c.symIdx]?.trim();
    const high = Number(cols[c.highIdx]);
    const low = Number(cols[c.lowIdx]);
    if (!symbol || !Number.isFinite(high) || !Number.isFinite(low) || low <= 0 || high < low) {
      continue;
    }
    ranges.set(symbol, { symbol, high, low });
  }
  return ranges;
}

interface CacheEntry {
  at: number;
  value: EquityCloses;
}
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 15 * 60_000;

/** Walks back up to 7 calendar days to find the latest published bhavcopy. */
export async function fetchLatestEquityCloses(): Promise<EquityCloses> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  const today = new Date();
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    try {
      const path = await nse().equityBhavcopy(d);
      const closes = parse(fs.readFileSync(path, "utf-8"));
      if (closes.size > 0) {
        cache = { at: Date.now(), value: closes };
        return closes;
      }
    } catch {
      // No bhavcopy for this date (weekend/holiday/not yet published) — try
      // the previous day.
    }
  }
  return new Map();
}

/**
 * One exact session's high/low for every equity, or `null` if that date has
 * no published bhavcopy (weekend, holiday, or too recent). Building block
 * for a rolling N-day range — see `lib/tools/marketScanner.ts` — rather
 * than a per-symbol live lookup: that endpoint (`historical.
 * fetchEquityHistoricalData`, the one source that carries a genuine
 * 52-week figure) proved too unreliable to build a real feature on,
 * confirmed live going from 5/5 successful to 0/20 failed within the same
 * session.
 */
export async function fetchEquityRangesForDate(date: Date): Promise<EquityDayRanges | null> {
  try {
    const path = await nse().equityBhavcopy(date);
    const ranges = parseRanges(fs.readFileSync(path, "utf-8"));
    return ranges.size > 0 ? ranges : null;
  } catch {
    return null;
  }
}
