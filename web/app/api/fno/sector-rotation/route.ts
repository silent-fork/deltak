import { NextResponse } from "next/server";

import { getSectorRotation } from "@/lib/sectors/rotation";
import { topPicksForLeadingSectors } from "@/lib/sectors/picks";
import type { SectorPicksEntry } from "@/lib/sectors/types";

/**
 * `GET /api/fno/sector-rotation` — the public F&O sector-rotation dashboard's
 * one data endpoint.
 *
 * Deliberately unauthenticated, unlike every route under `/api/market/*`:
 * this dashboard's whole point is to be reachable without a broker sign-in,
 * and it never touches Angel One or this app's own session — everything
 * here comes from NSE's public bhavcopy/constituent/F&O-lot data via
 * `nse-bse-api` and niftyindices.com.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let snapshot;
  try {
    snapshot = await getSectorRotation();
  } catch (err) {
    return NextResponse.json(
      {
        detail: err instanceof Error ? err.message : "Sector rotation fetch failed.",
      },
      { status: 502 },
    );
  }

  // `topPicksForSector` already swallows its own per-sector failures (see
  // its own doc comment); this is a second, belt-and-braces layer so that
  // even a bug there degrades to "no picks" rather than losing the RRG/
  // leaderboard data the request above already succeeded at fetching.
  let picks: SectorPicksEntry[] = [];
  try {
    picks = (await topPicksForLeadingSectors(snapshot.sectors)).map(({ sector, picks: p }) => ({
      sector: sector.label,
      picks: p,
    }));
  } catch {
    picks = [];
  }

  return NextResponse.json({ ...snapshot, picks });
}
