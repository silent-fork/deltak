import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { cachedProfile, fetchProfile, rememberProfile } from "@/lib/server/profile";
import { SESSION_COOKIE, SmartApiError, decodeSession } from "@/lib/server/smartapi";

/**
 * `GET /api/auth/profile` — who is signed in, in full.
 *
 * Login and session restore already carry the profile, so the HUD rarely needs
 * this. It exists for the refresh the operator asks for by hand, and it answers
 * for the cookie's account only — the client code is read from the session, not
 * from a query parameter, so this cannot be walked to look up somebody else.
 *
 * A broker outage falls back to the stored profile rather than a failure: the
 * account's name has not changed just because Angel One is throttling.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ detail: "No active SmartAPI session." }, { status: 401 });
  }

  try {
    const profile = await fetchProfile(session.jwtToken, session.clientCode);
    return NextResponse.json({ profile: await rememberProfile(profile, false) });
  } catch (err) {
    const cached = await cachedProfile(session.clientCode);
    if (cached) return NextResponse.json({ profile: cached, stale: true });

    const status = err instanceof SmartApiError ? err.status : 502;
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Profile read failed." },
      { status },
    );
  }
}
