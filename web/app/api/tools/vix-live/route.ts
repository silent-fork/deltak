import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getDhanVix } from "@/lib/tools/vix";
import type { VixReading } from "@/lib/tools/volatilityDeskTypes";
import { SESSION_COOKIE, decodeSession } from "@/lib/server/session";

/**
 * `GET /api/tools/vix-live` — India VIX's live LTP, Dhan sessions only.
 *
 * `/api/tools/volatility-desk` stays the VIX source for Angel One (and
 * everyone signed out): NSE's own historical feed, unauthenticated, ~EOD
 * cadence. A Dhan session can do better — its own market-feed quote for
 * India VIX's spot instrument, read live rather than from yesterday's
 * close-of-day print — which is what this route is for. Angel One has no
 * equivalent live-quote path for VIX (it isn't a tradeable instrument on
 * SmartAPI), so this stays Dhan-only rather than trying to unify the two.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session || session.broker !== "dhan") {
    return NextResponse.json(
      { detail: "Live VIX requires an active Dhan session." },
      { status: 401 },
    );
  }

  const vix: VixReading | null = await getDhanVix({
    accessToken: session.accessToken,
    clientId: session.clientCode,
  }).catch(() => null);

  return NextResponse.json({ asOf: new Date().toISOString(), vix });
}
