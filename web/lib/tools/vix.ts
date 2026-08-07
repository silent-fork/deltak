import "server-only";

import os from "node:os";

import { NSEClient } from "nse-bse-api";

import { DHAN_SPOT_SEGMENT } from "@/lib/market/dhanRequest";
import { loadAngelVixSpot } from "@/lib/server/angelMaster";
import { dhanQuote } from "@/lib/server/dhan";
import { loadDhanMaster } from "@/lib/server/dhanMaster";
import { LTP_URL, smartApiCall } from "@/lib/server/smartapi";

import type { VixReading, VixRegime } from "./volatilityDeskTypes";

export type { VixReading, VixRegime } from "./volatilityDeskTypes";

let client: NSEClient | null = null;
function nse(): NSEClient {
  client ??= new NSEClient(os.tmpdir(), { server: true, timeout: 15_000 });
  return client;
}

/**
 * India VIX's own historical bands — roughly: below 12 is an unusually calm
 * tape, 12–18 is ordinary, 18–25 is the zone where option premiums start
 * pricing real event risk, and above 25 is the kind of print that shows up
 * around genuine market stress. Approximate by design (there is no single
 * official threshold table), but the right order of magnitude for what
 * "elevated" should mean here.
 */
export function vixRegime(value: number): VixRegime {
  if (value < 12) return "Calm";
  if (value < 18) return "Normal";
  if (value < 25) return "Elevated";
  return "Panic";
}

interface CacheEntry {
  at: number;
  value: VixReading | null;
}
let cache: CacheEntry | null = null;
const CACHE_TTL_MS = 30 * 60_000;

export async function getVix(): Promise<VixReading | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;

  try {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - 10);
    const rows = (await nse().historical.fetchHistoricalVixData({
      from_date: from,
      to_date: to,
    })) as { EOD_CLOSE_INDEX_VAL?: number; VIX_PERC_CHG?: number; EOD_TIMESTAMP?: string }[];
    const last = rows[rows.length - 1];
    const value = last?.EOD_CLOSE_INDEX_VAL;
    if (!last || !value) {
      cache = { at: Date.now(), value: null };
      return null;
    }
    const reading: VixReading = {
      value,
      changePct: last.VIX_PERC_CHG ?? 0,
      asOf: last.EOD_TIMESTAMP ?? "",
      regime: vixRegime(value),
    };
    cache = { at: Date.now(), value: reading };
    return reading;
  } catch {
    cache = { at: Date.now(), value: null };
    return null;
  }
}

/**
 * Dhan-session VIX — the same regime classifier as `getVix`, but off a live
 * quote (`dhanQuote`) rather than NSE's EOD history, and never cached: this
 * is the whole point of a Dhan-specific path (see `/api/tools/vix-live`),
 * so the 30-minute staleness `getVix` accepts for its unauthenticated,
 * Angel-One-and-Dhan-alike route is exactly what this exists to avoid.
 */
export async function getDhanVix(creds: {
  accessToken: string;
  clientId: string;
}): Promise<VixReading | null> {
  const master = await loadDhanMaster();
  const securityId = master.vixSpot?.token;
  if (!securityId) return null;

  try {
    const quotes = await dhanQuote(creds, { [DHAN_SPOT_SEGMENT]: [Number(securityId)] });
    const leg = quotes[DHAN_SPOT_SEGMENT]?.[securityId];
    if (!leg || !leg.last_price) return null;

    const value = leg.last_price;
    const prevClose = leg.ohlc?.close;
    const changePct = prevClose ? Number((((value - prevClose) / prevClose) * 100).toFixed(2)) : 0;
    return { value, changePct, asOf: new Date().toISOString(), regime: vixRegime(value) };
  } catch {
    return null;
  }
}

/**
 * Angel-One-session VIX — same idea as `getDhanVix` (a live quote, never
 * cached, for the session-gated route), but off SmartAPI's `getLtpData`
 * rather than a Dhan-style market-feed quote. India VIX has its own row in
 * Angel One's scrip master (`loadAngelVixSpot`) despite not being a
 * tradeable instrument — `getLtpData` is a generic quote endpoint, not
 * restricted to order-placeable symbols, and this is the same request shape
 * already proven against real NFO contracts by `watchdogLtp`.
 */
export async function getAngelVix(jwt: string): Promise<VixReading | null> {
  const spot = await loadAngelVixSpot();
  if (!spot) return null;

  try {
    const data = (await smartApiCall(LTP_URL, {
      method: "POST",
      body: { exchange: "NSE", tradingsymbol: spot.tradingsymbol, symboltoken: spot.token },
      jwt,
    })) as { ltp?: number; close?: number };

    const value = data.ltp;
    if (!value) return null;
    const prevClose = data.close;
    const changePct = prevClose ? Number((((value - prevClose) / prevClose) * 100).toFixed(2)) : 0;
    return { value, changePct, asOf: new Date().toISOString(), regime: vixRegime(value) };
  } catch {
    return null;
  }
}
