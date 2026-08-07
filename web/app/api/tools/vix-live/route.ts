import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getAngelVix, getDhanVix } from "@/lib/tools/vix";
import type { VixReading } from "@/lib/tools/volatilityDeskTypes";
import { SESSION_COOKIE, decodeSession } from "@/lib/server/session";

/**
 * `GET /api/tools/vix-live` — India VIX's live LTP, for either broker's
 * authenticated session.
 *
 * `/api/tools/volatility-desk` stays the VIX source for a signed-out
 * visitor: NSE's own historical feed, unauthenticated, ~EOD cadence. A live
 * session can do better — a real-time quote read straight from the broker's
 * own feed rather than yesterday's close-of-day print — which is what this
 * route is for, off whichever broker the caller is actually signed into
 * (`getDhanVix` / `getAngelVix`; see `lib/tools/vix.ts` for both).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(
      { detail: "Live VIX requires an active broker session." },
      { status: 401 },
    );
  }

  const vix: VixReading | null =
    session.broker === "dhan"
      ? await getDhanVix({ accessToken: session.accessToken, clientId: session.clientCode }).catch(
          () => null,
        )
      : await getAngelVix(session.jwtToken).catch(() => null);

  return NextResponse.json({ asOf: new Date().toISOString(), vix });
}
