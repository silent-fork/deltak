import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { parsePcrRows } from "@/lib/market/parse";
import {
  PCR_URL,
  SESSION_COOKIE,
  SmartApiError,
  decodeSession,
  smartApiCall,
} from "@/lib/server/smartapi";

/**
 * `GET /api/market/pcr` — Angel One `putCallRatio`.
 *
 * Cumulative Put-Call Ratio across every strike of each underlying's options,
 * published against the underlying's *futures* symbol. It is a whole-market
 * read, unlike the chain's own PCR, which only covers the strikes the terminal
 * renders — the pair together is the useful signal: a window PCR far from the
 * cumulative one says the pressure is outside the rendered ladder.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(
      { detail: "PCR requires a SmartAPI session." },
      { status: 401 },
    );
  }

  try {
    const data = await smartApiCall<unknown>(PCR_URL, {
      method: "GET",
      jwt: session.jwtToken,
    });
    return NextResponse.json({
      rows: parsePcrRows(data),
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    const status = err instanceof SmartApiError ? err.status : 502;
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "PCR fetch failed." },
      { status },
    );
  }
}
