import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { istParts } from "@/lib/engine/config";
import { classifyOiBuildup } from "@/lib/market/dhanParse";
import {
  OI_BUILDUP_EXPIRIES,
  OI_BUILDUP_TYPES,
  isBuildupExpiry,
  isBuildupType,
} from "@/lib/market/constants";
import { parseBuildupRows } from "@/lib/market/parse";
import { readJson } from "@/lib/market/request";
import { dhanHistorical, dhanQuote } from "@/lib/server/dhan";
import { loadDhanMaster } from "@/lib/server/dhanMaster";
import {
  OI_BUILDUP_URL,
  SESSION_COOKIE,
  SmartApiError,
  decodeSession,
  smartApiCall,
} from "@/lib/server/smartapi";

/**
 * `POST /api/market/buildup` — Angel One `OIBuildup`, or (for Dhan, which has
 * no whole-board equivalent) the standard price/OI-change quadrant
 * classification computed per underlying's near-month futures contract —
 * see `classifyOiBuildup`. Only the nearest expiry is covered (Angel One's
 * `expirytype` NEXT/FAR buckets have no Dhan analogue here), and only NSE/BSE
 * underlyings this app actually trades, not the whole F&O board.
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
      { detail: "OI buildup requires an active broker session." },
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

  if (session.broker === "dhan") {
    try {
      const master = await loadDhanMaster();
      const entries = Object.entries(master.futures);
      if (!entries.length) {
        return NextResponse.json({ datatype, expirytype, rows: [], fetched_at: new Date().toISOString() });
      }

      const bySegment: Record<string, number[]> = {};
      for (const [, fut] of entries) {
        const seg = fut.exchSeg === "BFO" ? "BSE_FNO" : "NSE_FNO";
        (bySegment[seg] ??= []).push(Number(fut.securityId));
      }
      const quotes = await dhanQuote(
        { accessToken: session.accessToken, clientId: session.clientCode },
        bySegment,
      );

      const today = istParts().date;
      const rows = await Promise.all(
        entries.map(async ([underlying, fut]) => {
          const seg = fut.exchSeg === "BFO" ? "BSE_FNO" : "NSE_FNO";
          const current = quotes[seg]?.[fut.securityId];
          if (!current) return null;
          try {
            const daily = await dhanHistorical(
              { accessToken: session.accessToken, clientId: session.clientCode },
              {
                securityId: fut.securityId,
                exchangeSegment: seg,
                instrument: "FUTIDX",
                fromDate: new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10),
                toDate: today, // non-inclusive — the last bar returned is the last *completed* session
                oi: true,
              },
            );
            const n = daily.timestamp?.length ?? 0;
            if (!n) return null;
            const classified = classifyOiBuildup({
              securityId: fut.securityId,
              tradingSymbol: underlying,
              current: { ltp: current.last_price, oi: current.oi ?? 0 },
              previous: { close: daily.close[n - 1], oi: daily.open_interest?.[n - 1] ?? 0 },
            });
            return { ...classified, underlying };
          } catch {
            return null; // one contract's failure must not empty the whole read
          }
        }),
      );

      return NextResponse.json({
        datatype,
        expirytype,
        rows: rows.filter((r): r is NonNullable<typeof r> => r !== null && r.buildup === datatype),
        fetched_at: new Date().toISOString(),
      });
    } catch (err) {
      return NextResponse.json(
        { detail: err instanceof Error ? err.message : "OI buildup fetch failed." },
        { status: 502 },
      );
    }
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
