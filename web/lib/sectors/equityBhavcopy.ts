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
}

export type EquityCloses = Map<string, EquityClose>;

let client: NSEClient | null = null;
function nse(): NSEClient {
  client ??= new NSEClient(os.tmpdir(), { server: true, timeout: 20_000 });
  return client;
}

function parse(text: string): EquityCloses {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return new Map();

  const header = lines[0]!.split(",");
  const seriesIdx = header.indexOf("SctySrs");
  const symIdx = header.indexOf("TckrSymb");
  const closeIdx = header.indexOf("ClsPric");
  const prevIdx = header.indexOf("PrvsClsgPric");
  if ([seriesIdx, symIdx, closeIdx, prevIdx].some((i) => i < 0)) return new Map();

  const closes: EquityCloses = new Map();
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    // "EQ" is the ordinary equity series — bonds, ETFs and other instrument
    // types share this same bhavcopy file under other series codes.
    if (cols[seriesIdx] !== "EQ") continue;
    const symbol = cols[symIdx]?.trim();
    const close = Number(cols[closeIdx]);
    const prevClose = Number(cols[prevIdx]);
    if (!symbol || !Number.isFinite(close) || !Number.isFinite(prevClose) || prevClose <= 0) {
      continue;
    }
    closes.set(symbol, {
      symbol,
      close,
      prevClose,
      changePct: ((close - prevClose) / prevClose) * 100,
    });
  }
  return closes;
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
