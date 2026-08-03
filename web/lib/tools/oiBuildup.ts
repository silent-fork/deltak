import "server-only";

import fs from "node:fs";
import os from "node:os";

import { NSEClient } from "nse-bse-api";

import { fetchFnoLots } from "@/lib/sectors/fnoLots";
import type { OiBuildupStock, OiQuadrant } from "./volatilityDeskTypes";

export type { OiBuildupStock, OiQuadrant } from "./volatilityDeskTypes";

/**
 * Price-change × OI-change for every F&O stock's near-month future — the
 * classic Long/Short Buildup, Long Unwinding, Short Covering screener.
 *
 * Read off the bulk F&O bhavcopy (`nse.fnoBhavcopy`), not a per-symbol
 * live call — same reasoning as `equityBhavcopy.ts`. The bhavcopy's own
 * `FinInstrmTp` codes are `STF` (stock future), `STO` (stock option),
 * `IDF`/`IDO` (index future/option) — not the `FUTSTK`/`OPTSTK` naming the
 * equity-segment CM bhavcopy uses, confirmed live against a real pull.
 * Three expiries exist per stock; the nearest one (lexically smallest
 * `XpryDt`, which is `YYYY-MM-DD` and sorts correctly as a string) is the
 * one this screener's "today's positioning" claim is about.
 */

let client: NSEClient | null = null;
function nse(): NSEClient {
  client ??= new NSEClient(os.tmpdir(), { server: true, timeout: 20_000 });
  return client;
}

function classify(priceChangePct: number, oiChangePct: number): OiQuadrant {
  if (priceChangePct >= 0) return oiChangePct >= 0 ? "LONG_BUILDUP" : "SHORT_COVERING";
  return oiChangePct >= 0 ? "SHORT_BUILDUP" : "LONG_UNWINDING";
}

interface CacheEntry {
  at: number;
  value: OiBuildupStock[];
}
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 20 * 60_000;

export async function getOiBuildup(): Promise<OiBuildupStock[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  let text: string | null = null;
  const today = new Date();
  for (let i = 0; i < 5; i += 1) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    try {
      const path = await nse().fnoBhavcopy(d);
      text = fs.readFileSync(path, "utf-8");
      if (text.trim().length > 0) break;
    } catch {
      text = null;
    }
  }
  if (!text) {
    cache = { at: Date.now(), value: [] };
    return [];
  }

  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = lines[0]!.split(",");
  const typeIdx = header.indexOf("FinInstrmTp");
  const symIdx = header.indexOf("TckrSymb");
  const xpryIdx = header.indexOf("XpryDt");
  const closeIdx = header.indexOf("ClsPric");
  const prevIdx = header.indexOf("PrvsClsgPric");
  const oiIdx = header.indexOf("OpnIntrst");
  const chgOiIdx = header.indexOf("ChngInOpnIntrst");
  if ([typeIdx, symIdx, xpryIdx, closeIdx, prevIdx, oiIdx, chgOiIdx].some((i) => i < 0)) {
    cache = { at: Date.now(), value: [] };
    return [];
  }

  const nearest = new Map<
    string,
    { xpry: string; close: number; prev: number; oi: number; chgOi: number }
  >();
  for (const line of lines.slice(1)) {
    const cols = line.split(",");
    if (cols[typeIdx] !== "STF") continue;
    const symbol = cols[symIdx]?.trim();
    const xpry = cols[xpryIdx]?.trim();
    const close = Number(cols[closeIdx]);
    const prev = Number(cols[prevIdx]);
    const oi = Number(cols[oiIdx]);
    const chgOi = Number(cols[chgOiIdx]);
    if (!symbol || !xpry || !Number.isFinite(close) || !Number.isFinite(prev) || prev <= 0) {
      continue;
    }
    const existing = nearest.get(symbol);
    if (!existing || xpry < existing.xpry) {
      nearest.set(symbol, {
        xpry,
        close,
        prev,
        oi: Number.isFinite(oi) ? oi : 0,
        chgOi: Number.isFinite(chgOi) ? chgOi : 0,
      });
    }
  }

  const lots = await fetchFnoLots();
  const value: OiBuildupStock[] = [];
  for (const [symbol, d] of nearest) {
    if (!(symbol in lots)) continue;
    const priceChangePct = ((d.close - d.prev) / d.prev) * 100;
    const prevOi = d.oi - d.chgOi;
    const oiChangePct = prevOi > 0 ? (d.chgOi / prevOi) * 100 : 0;
    value.push({
      symbol,
      priceChangePct,
      oiChangePct,
      oi: d.oi,
      quadrant: classify(priceChangePct, oiChangePct),
    });
  }
  value.sort((a, b) => b.oi - a.oi);

  cache = { at: Date.now(), value };
  return value;
}
