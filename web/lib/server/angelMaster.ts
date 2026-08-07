import "server-only";

import { SCRIP_MASTER_URL } from "@/lib/engine/config";

/**
 * India VIX's own row in Angel One's scrip master — the counterpart to
 * `dhanMaster.ts`'s `vixSpot`, kept in its own small module rather than
 * folded into `app/api/master/route.ts`'s own parse: that route already
 * projects the full ~40 MB master into the five tradeable indexes every
 * hour, and VIX isn't one of them (it isn't in `INDEX_UNIVERSE` — not a
 * tradeable underlying, just a quote). Re-downloading the same file here
 * rather than sharing that route's in-memory result keeps this module
 * independent of the client-facing master's own shape and cache lifetime;
 * confirmed present in a live master fetch (2026-08): token `99926017`,
 * `exch_seg: "NSE"`, `instrumenttype: "AMXIDX"`, blank expiry — the same
 * row shape as any other NSE index spot (NIFTY 50 included), which is why
 * `getLtpData` — Angel One's own generic quote endpoint, not restricted to
 * tradeable instruments — is expected to serve it identically.
 */

const CACHE_MS = 60 * 60 * 1000;

export interface AngelVixSpot {
  token: string;
  tradingsymbol: string;
}

interface RawRow {
  token?: string;
  symbol?: string;
  name?: string;
  expiry?: string;
  exch_seg?: string;
}

let cached: { at: number; spot: Promise<AngelVixSpot | null> } | null = null;

async function findVixSpot(): Promise<AngelVixSpot | null> {
  const res = await fetch(SCRIP_MASTER_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Scrip master download failed (HTTP ${res.status}).`);
  const rows = (await res.json()) as RawRow[];

  for (const row of rows) {
    if (
      (row.exch_seg ?? "").toUpperCase() === "NSE" &&
      (row.name ?? "").trim().toUpperCase() === "INDIA VIX" &&
      !(row.expiry ?? "")
    ) {
      return { token: String(row.token), tradingsymbol: (row.symbol ?? "India VIX").trim() };
    }
  }
  return null;
}

/** Cached the same 1-hour lifetime as `loadDhanMaster` — the master itself changes at most once a day. */
export function loadAngelVixSpot(): Promise<AngelVixSpot | null> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.spot;
  const spot = findVixSpot().catch((err) => {
    cached = null; // a failed parse must not poison the cache for the next request
    throw err;
  });
  cached = { at: Date.now(), spot };
  return spot;
}
