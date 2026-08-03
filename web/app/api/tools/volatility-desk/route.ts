import { NextResponse } from "next/server";

import { getOiBuildup } from "@/lib/tools/oiBuildup";
import { getAllIndexOptionMetrics } from "@/lib/tools/optionMetrics";
import { getVix } from "@/lib/tools/vix";
import type { VolatilityDeskResponse } from "@/lib/tools/volatilityDeskTypes";

/**
 * `GET /api/tools/volatility-desk` — OI buildup, per-index PCR/max pain,
 * and India VIX, all off NSE's own public data (F&O bhavcopy, option-chain
 * snapshot, VIX history). Unauthenticated, never Angel One.
 *
 * Each of the three sub-fetches is caught independently, sequentially —
 * same reasoning as `market-scanner`'s route: nothing here is latency
 * sensitive against a hard SLA, and racing several NSE-facing calls at
 * once is the one thing that's reliably made this app's NSE integrations
 * less reliable, not more.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const oiBuildup = await getOiBuildup().catch(() => []);
  const indices = await getAllIndexOptionMetrics().catch(() => []);
  const vix = await getVix().catch(() => null);

  const body: VolatilityDeskResponse = {
    asOf: new Date().toISOString(),
    oiBuildup,
    indices,
    vix,
  };
  return NextResponse.json(body);
}
