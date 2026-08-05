import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { forgetActiveSession } from "@/lib/server/activeSession";
import { forgetBrokerSession } from "@/lib/server/brokerSession";
import {
  LOGOUT_URL,
  SESSION_COOKIE,
  decodeSession,
  smartApiCall,
} from "@/lib/server/smartapi";

/**
 * `POST /api/auth/logout` — end the session at the broker, then locally.
 *
 * Clearing the cookie alone leaves the JWT this tab was using valid at Angel
 * One until it expires on its own — a stolen or cached copy would still trade.
 * SmartAPI's `logout` call invalidates it immediately. It is best-effort: a
 * broker outage must not strand an operator who is trying to sign out, so the
 * cookie is cleared either way.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);

  if (session) {
    // Dhan has no documented logout/invalidate endpoint in the Data API — the
    // access token simply ages out on its own 24h clock.
    if (session.broker === "angelone") {
      await smartApiCall(LOGOUT_URL, {
        method: "POST",
        jwt: session.jwtToken,
        body: { clientcode: session.clientCode },
      }).catch(() => undefined);
      // A signed-out account should leave nothing behind for a background job
      // to decrypt and use.
      await forgetBrokerSession(session.clientCode);
    }
    // And nothing behind to compare a next login against — that row's only
    // job is telling a *different*, still-open window it's been superseded.
    await forgetActiveSession(session.clientCode);
  }

  const res = NextResponse.json({ authenticated: false });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
