import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { parseCandles, sessionSlice } from "@/lib/market/parse";
import { parseHistoricalBody, readJson } from "@/lib/market/request";
import {
  CANDLE_URL,
  SESSION_COOKIE,
  SmartApiError,
  decodeSession,
  smartApiCall,
} from "@/lib/server/smartapi";

/**
 * `POST /api/market/candles` — Angel One `getCandleData`.
 *
 * One endpoint covers every segment; `exchange` in the body selects it. The
 * response is normalised from positional tuples into named bars, and the most
 * recent trading session is sliced out server-side so the browser never has to
 * guess which of the returned days was actually a trading day.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(
      { detail: "Historical data requires a SmartAPI session." },
      { status: 401 },
    );
  }

  const parsed = parseHistoricalBody(await readJson(request));
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
