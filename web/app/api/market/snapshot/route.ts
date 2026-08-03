import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { INDEX_UNIVERSE } from "@/lib/engine/config";
import { istDate, shiftDate } from "@/lib/market/clock";
import { SESSION_COOKIE, decodeSession } from "@/lib/server/smartapi";
import {
  readMarketSnapshot,
  writeMarketSnapshot,
} from "@/lib/supabase";
import type { MarketSnapshotPayload } from "@/lib/types";

/**
 * `GET/POST /api/market/snapshot?underlying=NIFTY` — the closed-market
 * board-hydration store (`market_snapshots`, see the migration comment for
 * the two write sites and the read site).
 *
 * Global, not per client code — every field here describes the market, not
 * an account — but still gated on this app's own session so the route
 * cannot be used as an open read/write proxy onto Supabase by anyone who
 * finds the URL.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * How many calendar days old a stored snapshot may be and still count as
 * "the last available session" rather than stale leftovers. Matches the
 * lookback the historical fetches themselves use (`CANDLE_LOOKBACK_DAYS` in
 * `useMarketData.ts`) — wide enough to clear a long weekend or a short
 * holiday run, without reaching back so far a genuinely abandoned row gets
 * mistaken for today's close.
 */
const MAX_SNAPSHOT_AGE_DAYS = 5;

function isFresh(sessionDate: string): boolean {
  const today = istDate();
  const floor = shiftDate(today, -MAX_SNAPSHOT_AGE_DAYS);
  return sessionDate >= floor && sessionDate <= today;
}

export async function GET(request: Request) {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ detail: "Sign in required." }, { status: 401 });
  }

  const underlying = new URL(request.url).searchParams.get("underlying") ?? "";
  if (!INDEX_UNIVERSE[underlying]) {
    return NextResponse.json(
      { detail: `${underlying || "(missing)"} is not a known underlying.` },
      { status: 400 },
    );
  }

  try {
    const row = await readMarketSnapshot(underlying);
    if (!row || !isFresh(row.session_date)) {
      return NextResponse.json({ found: false });
    }
    return NextResponse.json({
      found: true,
      underlying,
      sessionDate: row.session_date,
      updatedAt: row.updated_at,
      payload: row.snapshot as MarketSnapshotPayload,
    });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Snapshot read failed." },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ detail: "Sign in required." }, { status: 401 });
  }

  const raw = (await request.json().catch(() => null)) as {
    underlying?: unknown;
    sessionDate?: unknown;
    payload?: unknown;
  } | null;

  const underlying = String(raw?.underlying ?? "");
  const sessionDate = String(raw?.sessionDate ?? "");
  if (!INDEX_UNIVERSE[underlying]) {
    return NextResponse.json(
      { detail: `${underlying || "(missing)"} is not a known underlying.` },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate)) {
    return NextResponse.json(
      { detail: "sessionDate must be YYYY-MM-DD." },
      { status: 400 },
    );
  }
  if (!raw?.payload || typeof raw.payload !== "object") {
    return NextResponse.json({ detail: "payload is required." }, { status: 400 });
  }

  try {
    await writeMarketSnapshot(underlying, sessionDate, raw.payload);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Snapshot write failed." },
      { status: 502 },
    );
  }
}
