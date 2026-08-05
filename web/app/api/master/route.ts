import { NextResponse } from "next/server";

import { INDEX_UNIVERSE, SCRIP_MASTER_URL } from "@/lib/engine/config";
import { parseExpiry, type Instrument, type MasterPayload } from "@/lib/engine/scripMaster";
import { loadDhanMaster, toMasterPayload } from "@/lib/server/dhanMaster";

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
/**
 * Never prerendered: a `revalidate` export with no `dynamic` here used to let
 * `next build` treat this as a static route and execute it at build time —
 * downloading the 40 MB scrip master just to hit Next's Data Cache's 2 MB
 * response-size ceiling and log a "can not be cached" warning for a body
 * that was never going to be reused build-to-build anyway. The real hour-long
 * cache is the response's own `Cache-Control` below, served at the edge.
 */
export const dynamic = "force-dynamic";
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

/** Case- and whitespace-insensitive — a real naming variant is the only thing worth failing this match on. */
function normalizeSpotAlias(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, " ");
}

const SPOT_LOOKUP: Record<string, string> = {};
for (const [underlying, spec] of Object.entries(INDEX_UNIVERSE)) {
  for (const alias of spec.spotAliases) SPOT_LOOKUP[normalizeSpotAlias(alias)] = underlying;
}

export async function GET(request: Request) {
  const broker = new URL(request.url).searchParams.get("broker");
  if (broker === "dhan") {
    try {
      const payload = toMasterPayload(await loadDhanMaster());
      return NextResponse.json(payload, {
        headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
      });
    } catch (err) {
      return NextResponse.json(
        { detail: err instanceof Error ? err.message : "Dhan instrument master unreachable." },
        { status: 502 },
      );
    }
  }

  let rows: RawRow[];
  try {
    const res = await fetch(SCRIP_MASTER_URL, { cache: "no-store" });
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

    if (seg === "NSE" || seg === "BSE") {
      const key = SPOT_LOOKUP[normalizeSpotAlias(name)] ?? SPOT_LOOKUP[normalizeSpotAlias(symbol)];
      // A row only counts for an underlying actually listed on this segment —
      // BSE and NSE both carry plenty of unrelated index/equity spots that
      // could otherwise collide on a loose name match.
      if (key && INDEX_UNIVERSE[key].exchange !== seg) continue;
      // Index spots carry no expiry; the futures/options rows do.
      if (key && !spots[key] && !(row.expiry ?? "")) {
        spots[key] = {
          token: String(row.token),
          symbol: symbol || name,
          name: key,
          exchSeg: seg,
          strike: 0,
          lotSize: 1,
          expiry: null,
          optionType: null,
        };
      }
      continue;
    }

    if (seg !== "NFO" && seg !== "BFO") continue;
    if ((row.instrumenttype ?? "").toUpperCase() !== "OPTIDX") continue;

    const underlying = name.toUpperCase();
    const spec = INDEX_UNIVERSE[underlying];
    if (!spec) continue;
    // Same cross-segment guard as the spot branch above.
    if ((seg === "NFO" && spec.exchange !== "NSE") || (seg === "BFO" && spec.exchange !== "BSE")) {
      continue;
    }

    const expiry = parseExpiry(row.expiry ?? "");
    if (!expiry) continue;

    const optionType = symbol.slice(-2).toUpperCase();
    if (optionType !== "CE" && optionType !== "PE") continue;

    (options[underlying] ??= []).push({
      token: String(row.token),
      symbol,
      name: underlying,
      exchSeg: seg,
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

  // Fallback spot tokens keep the HUD alive if the master's own name match
  // missed an index — logged loudly, because a silent fallback here is
  // exactly the kind of thing a real naming-drift bug hides behind.
  for (const [underlying, spec] of Object.entries(INDEX_UNIVERSE)) {
    if (spots[underlying]) continue;
    console.warn(
      `[api/master] ${underlying} spot not found in the live master (checked aliases: ${spec.spotAliases.join(", ")}) — falling back to the configured token ${spec.spotTokenFallback}.`,
    );
    spots[underlying] = {
      token: spec.spotTokenFallback,
      symbol: spec.label,
      name: underlying,
      exchSeg: spec.exchange,
      strike: 0,
      lotSize: 1,
      expiry: null,
      optionType: null,
    };
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
