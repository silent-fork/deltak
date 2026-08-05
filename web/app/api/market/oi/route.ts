import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { parseDhanOiSeries } from "@/lib/market/dhanParse";
import { parseOiSeries } from "@/lib/market/parse";
import { parseHistoricalBody, readJson } from "@/lib/market/request";
import { DhanApiError, dhanIntraday } from "@/lib/server/dhan";
import {
  OI_DATA_URL,
  SESSION_COOKIE,
  SmartApiError,
  decodeSession,
  smartApiCall,
} from "@/lib/server/smartapi";

/**
 * `POST /api/market/oi` — Angel One `getOIData`, or (for Dhan) the same
 * `/charts/intraday` call `/api/market/candles` makes, with `oi:true` —
 * Dhan serves candles and OI from one endpoint, so there is no second
 * upstream call here, just a second slice of the same response shape.
 *
 * Historical open interest for live F&O contracts. This is what gives COA
 * 2.0 a true intraday ΔOI: the feed can only report OI from the moment the
 * terminal connected, so a session joined at noon would otherwise read every
 * strike as "no change".
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(
      { detail: "Historical OI requires an active broker session." },
      { status: 401 },
    );
  }

  const raw = await readJson(request);

  if (session.broker === "dhan") {
    const body = raw as Record<string, unknown> | null;
    const securityId = String(body?.securityId ?? "");
    const exchangeSegment = String(body?.exchangeSegment ?? "");
    const instrument = String(body?.instrument ?? "");
    const interval = String(body?.interval ?? "5") as "1" | "5" | "15" | "25" | "60";
    const fromDate = String(body?.fromDate ?? "");
    const toDate = String(body?.toDate ?? "");
    if (!securityId || !exchangeSegment || !instrument || !fromDate || !toDate) {
      return NextResponse.json(
        { detail: "securityId, exchangeSegment, instrument, fromDate and toDate are required." },
        { status: 400 },
      );
    }
    try {
      const data = await dhanIntraday(
        { accessToken: session.accessToken, clientId: session.clientCode },
        { securityId, exchangeSegment, instrument, interval, fromDate, toDate, oi: true },
      );
      const series = parseDhanOiSeries(data);
      return NextResponse.json({
        token: securityId,
        interval,
        series,
        open_oi: series.length ? series[0].oi : null,
        last_oi: series.length ? series[series.length - 1].oi : null,
      });
    } catch (err) {
      const status = err instanceof DhanApiError ? err.status : 502;
      return NextResponse.json(
        { detail: err instanceof Error ? err.message : "OI history fetch failed." },
        { status },
      );
    }
  }

  const parsed = parseHistoricalBody(raw);
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
