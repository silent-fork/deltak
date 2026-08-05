import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { INDEX_UNIVERSE } from "@/lib/engine/config";
import { ScripMaster } from "@/lib/engine/scripMaster";
import { pcrFromOptionChain } from "@/lib/market/dhanParse";
import { parsePcrRows } from "@/lib/market/parse";
import { dhanOptionChain } from "@/lib/server/dhan";
import { loadDhanMaster, toMasterPayload } from "@/lib/server/dhanMaster";
import {
  PCR_URL,
  SESSION_COOKIE,
  SmartApiError,
  decodeSession,
  smartApiCall,
} from "@/lib/server/smartapi";

/**
 * `GET /api/market/pcr` — Angel One `putCallRatio`, or (for Dhan, which has
 * no whole-exchange PCR endpoint) ΣPE-OI/ΣCE-OI computed per underlying from
 * the Option Chain API. This is a narrower read than Angel One's — one
 * underlying's own nearest-expiry chain, not every symbol on the exchange —
 * disclosed via `PcrRow.underlying` rather than pretended away.
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
      { detail: "PCR requires an active broker session." },
      { status: 401 },
    );
  }

  if (session.broker === "dhan") {
    try {
      const master = new ScripMaster(toMasterPayload(await loadDhanMaster()));
      const rows = await Promise.all(
        Object.entries(INDEX_UNIVERSE).map(async ([underlying, spec]) => {
          const expiry = master.nearestExpiry(underlying);
          const spotToken = master.spotToken(underlying);
          if (!expiry || !spotToken) return null;
          try {
            const chain = await dhanOptionChain(
              { accessToken: session.accessToken, clientId: session.clientCode },
              { underlyingScrip: Number(spotToken), underlyingSeg: "IDX_I", expiry },
            );
            return pcrFromOptionChain(chain, underlying);
          } catch {
            return null; // one underlying's throttle/miss must not empty the whole read
          }
        }),
      );
      return NextResponse.json({
        rows: rows.filter((r): r is NonNullable<typeof r> => r !== null),
        fetched_at: new Date().toISOString(),
      });
    } catch (err) {
      return NextResponse.json(
        { detail: err instanceof Error ? err.message : "PCR fetch failed." },
        { status: 502 },
      );
    }
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
