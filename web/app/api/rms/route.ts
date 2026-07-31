import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  RMS_URL,
  SESSION_COOKIE,
  SmartApiError,
  decodeSession,
  smartApiCall,
} from "@/lib/server/smartapi";

/** `GET /api/rms` — available margin, for pre-trade leverage checks. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ detail: "No active SmartAPI session." }, { status: 401 });
  }

  try {
    const data = await smartApiCall<Record<string, string>>(RMS_URL, {
      method: "GET",
      jwt: session.jwtToken,
    });
    const num = (key: string) => Number(data[key] ?? 0) || 0;
    return NextResponse.json({
      net: num("net"),
      available_cash: num("availablecash"),
      utilised_debits: num("utiliseddebits"),
      source: "live",
    });
  } catch (err) {
    const status = err instanceof SmartApiError ? err.status : 502;
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "RMS read failed." },
      { status },
    );
  }
}
