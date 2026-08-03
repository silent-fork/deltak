import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { INDEX_UNIVERSE } from "@/lib/engine/config";
import { fetchOptionChainSnapshot } from "@/lib/server/nse";
import { SESSION_COOKIE, decodeSession } from "@/lib/server/smartapi";

/**
 * `GET /api/market/nse-option-chain?underlying=NIFTY` — NSE's own
 * option-chain snapshot, not Angel One. Closed-market gap-filler only; see
 * `lib/server/nse.ts` for what it can and cannot supply.
 *
 * NSE-listed underlyings only — BANKEX/SENSEX (BSE) have no equivalent
 * endpoint in this package and are rejected here rather than left to fail
 * upstream with a less legible error.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ detail: "Sign in required." }, { status: 401 });
  }

  const underlying = new URL(request.url).searchParams.get("underlying") ?? "";
  const spec = INDEX_UNIVERSE[underlying];
  if (!spec || spec.exchange !== "NSE") {
    return NextResponse.json(
      { detail: `${underlying || "(missing)"} has no NSE option-chain snapshot.` },
      { status: 400 },
    );
  }

  try {
    const snapshot = await fetchOptionChainSnapshot(underlying);
    return NextResponse.json(snapshot);
  } catch (err) {
    return NextResponse.json(
      {
        detail:
          err instanceof Error ? err.message : "NSE option-chain fetch failed.",
      },
      { status: 502 },
    );
  }
}
