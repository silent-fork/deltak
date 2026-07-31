import { NextResponse } from "next/server";

import { INDEX_UNIVERSE, SCRIP_MASTER_URL } from "@/lib/engine/config";
import { parseExpiry, type Instrument, type MasterPayload } from "@/lib/engine/scripMaster";

/**
 * `GET /api/master` — unauthenticated scrip-master cold bootstrap.
 *
 * The raw file is ~40 MB of every tradable instrument on the exchange. Shipping
 * that to a browser on every page load would be absurd, so the download and
 * projection happen here and only the index-option slice crosses the wire
 * (a few hundred KB).
 *
 * The response is cached at the edge for an hour: contract masters change once a
 * day, and re-downloading 40 MB per visitor would be the single most expensive
 * thing this app does.
 */

export const runtime = "nodejs";
export const revalidate = 3600;
/** The 40 MB parse needs headroom beyond the default function timeout. */
export const maxDuration = 60;

/** Expiries retained per underlying — the engine only trades the front ones. */
const EXPIRY_DEPTH = 3;

interface RawRow {
  token?: string;
  symbol?: string;
  name?: string;
  expiry?: string;
  strike?: string;
  lotsize?: string;
  instrumenttype?: string;
  exch_seg?: string;
}

const SPOT_LOOKUP: Record<string, string> = {};
for (const [underlying, spec] of Object.entries(INDEX_UNIVERSE)) {
  for (const alias of spec.spotAliases) SPOT_LOOKUP[alias] = underlying;
}

export async function GET() {
  let rows: RawRow[];
  try {
    const res = await fetch(SCRIP_MASTER_URL, { next: { revalidate: 3600 } });
    if (!res.ok) {
      return NextResponse.json(
        { detail: `Scrip master download failed (HTTP ${res.status}).` },
        { status: 502 },
      );
    }
    rows = (await res.json()) as RawRow[];
  } catch (err) {
    return NextResponse.json(
      {
        detail: `Scrip master unreachable: ${err instanceof Error ? err.message : "network error"}`,
      },
      { status: 502 },
    );
  }

  const spots: Record<string, Instrument> = {};
  const options: Record<string, Instrument[]> = {};
  const today = new Date().toISOString().slice(0, 10);

  for (const row of rows) {
    const seg = (row.exch_seg ?? "").toUpperCase();
    const name = (row.name ?? "").trim();
    const symbol = (row.symbol ?? "").trim();

    if (seg === "NSE") {
      const key = SPOT_LOOKUP[name.toLowerCase()] ?? SPOT_LOOKUP[symbol.toLowerCase()];
      // Index spots carry no expiry; the futures/options rows do.
      if (key && !spots[key] && !(row.expiry ?? "")) {
        spots[key] = {
          token: String(row.token),
          symbol: symbol || name,
          name: key,
          exchSeg: "NSE",
          strike: 0,
          lotSize: 1,
          expiry: null,
          optionType: null,
        };
      }
      continue;
    }

    if (seg !== "NFO") continue;
    if ((row.instrumenttype ?? "").toUpperCase() !== "OPTIDX") continue;

    const underlying = name.toUpperCase();
    if (!(underlying in INDEX_UNIVERSE)) continue;

    const expiry = parseExpiry(row.expiry ?? "");
    if (!expiry) continue;

    const optionType = symbol.slice(-2).toUpperCase();
    if (optionType !== "CE" && optionType !== "PE") continue;

    (options[underlying] ??= []).push({
      token: String(row.token),
      symbol,
      name: underlying,
      exchSeg: "NFO",
      // Scrip-master strikes are quoted in paise.
      strike: Number(row.strike ?? 0) / 100,
      lotSize: Math.trunc(Number(row.lotsize ?? 0)) || 0,
      expiry,
      optionType,
    });
  }

  // Keep only the front expiries — the whole chain would be megabytes again.
  for (const [underlying, list] of Object.entries(options)) {
    const expiries = [...new Set(list.map((c) => c.expiry!))].sort();
    const future = expiries.filter((e) => e >= today);
    const keep = new Set((future.length ? future : expiries.slice(-EXPIRY_DEPTH)).slice(0, EXPIRY_DEPTH));
    options[underlying] = list.filter((c) => c.expiry && keep.has(c.expiry));
  }

  // Fallback spot tokens keep the HUD alive if the master omits an index.
  for (const [underlying, spec] of Object.entries(INDEX_UNIVERSE)) {
    if (!spots[underlying]) {
      spots[underlying] = {
        token: spec.spotTokenFallback,
        symbol: spec.label,
        name: underlying,
        exchSeg: "NSE",
        strike: 0,
        lotSize: 1,
        expiry: null,
        optionType: null,
      };
    }
  }

  const payload: MasterPayload = {
    generatedAt: new Date().toISOString(),
    totalRecords: rows.length,
    spots,
    options,
  };

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
