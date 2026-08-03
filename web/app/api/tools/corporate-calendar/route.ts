import { NextResponse } from "next/server";

import { getBlockDeals } from "@/lib/tools/blockDeals";
import { getRecentIpos, getUpcomingEvents } from "@/lib/tools/corporateCalendar";
import type { CorporateCalendarResponse } from "@/lib/tools/corporateCalendarTypes";

/**
 * `GET /api/tools/corporate-calendar` — upcoming results/actions/IPOs,
 * recent IPO listings, and today's block deals, all off NSE's own public
 * corporate/IPO/market APIs. Unauthenticated, never Angel One.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const events = await getUpcomingEvents().catch(() => []);
  const recentIpos = await getRecentIpos().catch(() => []);
  const blockDeals = await getBlockDeals().catch(() => []);

  const body: CorporateCalendarResponse = {
    asOf: new Date().toISOString(),
    events,
    recentIpos,
    blockDeals,
  };
  return NextResponse.json(body);
}
