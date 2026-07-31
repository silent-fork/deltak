import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { parseOiSeries } from "@/lib/market/parse";
import { parseHistoricalBody, readJson } from "@/lib/market/request";
import {
  OI_DATA_URL,
  SESSION_COOKIE,
  SmartApiError,
  decodeSession,
  smartApiCall,
} from "@/lib/server/smartapi";

/**
 * `POST /api/market/oi` — Angel One `getOIData`.
 *
 * Historical open interest for live F&O contracts, keyed by the scrip-master
 * token. This is what gives COA 2.0 a true intraday ΔOI: the feed can only
 * report OI from the moment the terminal connected, so a session joined at
 * noon would otherwise read every strike as "no change".
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(
      { detail: "Historical OI requires a SmartAPI session." },
      { status: 401 },
    );
  }

  const parsed = parseHistoricalBody(await readJson(request));
  if (!parsed.ok) {
    return NextResponse.json({ detail: parsed.detail }, { status: 400 });
  }

  try {
    const data = await smartApiCall<unknown>(OI_DATA_URL, {
      method: "POST",
      body: parsed.body,
      jwt: session.jwtToken,
    });
    const series = parseOiSeries(data);
    return NextResponse.json({
      token: parsed.body.symboltoken,
      interval: parsed.body.interval,
      series,
      /** First reading of the window — the session-open baseline. */
      open_oi: series.length ? series[0].oi : null,
      last_oi: series.length ? series[series.length - 1].oi : null,
    });
  } catch (err) {
    const status = err instanceof SmartApiError ? err.status : 502;
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "OI history fetch failed." },
      { status },
    );
  }
}
