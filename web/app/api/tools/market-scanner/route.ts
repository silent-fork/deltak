import { NextResponse } from "next/server";

import { getRangeRadar, getSectorHeatmap } from "@/lib/tools/marketScanner";

/**
 * `GET /api/tools/market-scanner` — sector heatmap + range radar, both off
 * NSE's own public bulk bhavcopy/constituent data. Unauthenticated, like
 * every route under `/api/tools/*` and `/api/fno/*`: this whole family is
 * meant to be reachable without a broker sign-in.
 *
 * The two halves are fetched and caught independently so one failing never
 * blanks out the other — sequential rather than `Promise.all` since both
 * do their own multi-day bhavcopy backfill and there is no latency
 * pressure worth racing them for on an endpoint cached the better part of
 * an hour either side.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const heatmap = await getSectorHeatmap()
    .then((value) => ({ status: "fulfilled" as const, value }))
    .catch((reason) => ({ status: "rejected" as const, reason }));
  const radar = await getRangeRadar()
    .then((value) => ({ status: "fulfilled" as const, value }))
    .catch((reason) => ({ status: "rejected" as const, reason }));

  if (heatmap.status === "rejected") {
    return NextResponse.json(
      {
        detail:
          heatmap.reason instanceof Error ? heatmap.reason.message : "Sector heatmap fetch failed.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    asOf: new Date().toISOString(),
    sectors: heatmap.value,
    radar: radar.status === "fulfilled" ? radar.value : [],
  });
}
