import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  OI_BUILDUP_EXPIRIES,
  OI_BUILDUP_TYPES,
  isBuildupExpiry,
  isBuildupType,
} from "@/lib/market/constants";
import { parseBuildupRows } from "@/lib/market/parse";
import { readJson } from "@/lib/market/request";
import {
  OI_BUILDUP_URL,
  SESSION_COOKIE,
  SmartApiError,
  decodeSession,
  smartApiCall,
} from "@/lib/server/smartapi";

/**
 * `POST /api/market/buildup` — Angel One `OIBuildup`.
 *
 * Long Built Up, Short Built Up, Short Covering and Long Unwinding across the
 * F&O universe for a given expiry bucket. Price and open interest moving
 * together is accumulation; moving apart is an unwind — which is the same
 * question the COA panel asks of a single wall, asked of the whole market.
 *
 * `datatype` is spelt exactly as Angel One spells it (single spaces, that
 * "Built Up"), so it is matched against the documented set rather than
 * reconstructed from a client string.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(
      { detail: "OI buildup requires a SmartAPI session." },
      { status: 401 },
    );
  }

  const raw = (await readJson(request)) as Record<string, unknown> | null;
  const datatype = raw?.datatype;
  const expirytype = raw?.expirytype;

  if (!isBuildupType(datatype)) {
    return NextResponse.json(
      { detail: `datatype must be one of: ${OI_BUILDUP_TYPES.join(", ")}.` },
      { status: 400 },
    );
  }
  if (!isBuildupExpiry(expirytype)) {
    return NextResponse.json(
      { detail: `expirytype must be one of: ${OI_BUILDUP_EXPIRIES.join(", ")}.` },
      { status: 400 },
    );
  }

  try {
    const data = await smartApiCall<unknown>(OI_BUILDUP_URL, {
      method: "POST",
      body: { expirytype, datatype },
      jwt: session.jwtToken,
    });
    return NextResponse.json({
      datatype,
      expirytype,
      rows: parseBuildupRows(data),
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    const status = err instanceof SmartApiError ? err.status : 502;
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "OI buildup fetch failed." },
      { status },
    );
  }
}
