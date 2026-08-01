import { cookies } from "next/headers";
import { NextResponse } from "next/server";

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
    await smartApiCall(LOGOUT_URL, {
      method: "POST",
      jwt: session.jwtToken,
      body: { clientcode: session.clientCode },
    }).catch(() => undefined);
    // A signed-out account should leave nothing behind for a background job
    // to decrypt and use.
    await forgetBrokerSession(session.clientCode);
  }

  const res = NextResponse.json({ authenticated: false });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
