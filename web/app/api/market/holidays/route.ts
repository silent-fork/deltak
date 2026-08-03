import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { fetchUpcomingHolidays } from "@/lib/server/nse";
import { SESSION_COOKIE, decodeSession } from "@/lib/server/smartapi";

/**
 * `GET /api/market/holidays` — NSE's F&O trading-holiday calendar.
 *
 * Unlike every other route in this folder, the upstream call carries no
 * Angel One JWT at all — `nse-bse-api` hits NSE's own public site directly.
 * Still gated on this app's own session rather than left open: an
 * unauthenticated route here would make this deployment a free, unbounded
 * proxy onto someone else's website.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ detail: "Sign in required." }, { status: 401 });
  }

  try {
    const holidays = await fetchUpcomingHolidays();
    return NextResponse.json({ holidays, fetched_at: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json(
      {
        detail:
          err instanceof Error ? err.message : "Holiday calendar fetch failed.",
      },
      { status: 502 },
    );
  }
}
