import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { parseDhanCandles } from "@/lib/market/dhanParse";
import { parseCandles, sessionSlice } from "@/lib/market/parse";
import { parseHistoricalBody, readJson } from "@/lib/market/request";
import { DhanApiError, dhanIntraday } from "@/lib/server/dhan";
import {
  CANDLE_URL,
  SESSION_COOKIE,
  SmartApiError,
  decodeSession,
  smartApiCall,
} from "@/lib/server/smartapi";

/**
 * `POST /api/market/candles` — Angel One `getCandleData`, or Dhan's
 * `/charts/intraday`, chosen by the session's broker.
 *
 * One endpoint covers every segment; `exchange`/`exchangeSegment` in the body
 * selects it. The response is normalised into named bars either way, and the
 * most recent trading session is sliced out server-side so the browser never
 * has to guess which of the returned days was actually a trading day.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(
      { detail: "Historical data requires an active broker session." },
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
        { securityId, exchangeSegment, instrument, interval, fromDate, toDate },
      );
      const candles = parseDhanCandles(data);
      const { session: sessionCandles, stats } = sessionSlice(candles);
      return NextResponse.json({ interval, candles, session: sessionCandles, stats });
    } catch (err) {
      const status = err instanceof DhanApiError ? err.status : 502;
      return NextResponse.json(
        { detail: err instanceof Error ? err.message : "Candle fetch failed." },
        { status },
      );
    }
  }

  const parsed = parseHistoricalBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ detail: parsed.detail }, { status: 400 });
  }

  try {
    const data = await smartApiCall<unknown>(CANDLE_URL, {
      method: "POST",
      body: parsed.body,
      jwt: session.jwtToken,
    });
    const candles = parseCandles(data);
    const { session: sessionCandles, stats } = sessionSlice(candles);
    return NextResponse.json({
      interval: parsed.body.interval,
      candles,
      session: sessionCandles,
      stats,
    });
  } catch (err) {
    const status = err instanceof SmartApiError ? err.status : 502;
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Candle fetch failed." },
      { status },
    );
  }
}
