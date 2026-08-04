import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  decodeForumSession,
  encodeForumSession,
  FORUM_SESSION_COOKIE,
  FORUM_SESSION_COOKIE_OPTIONS,
  freshIdToken,
} from "@/lib/server/firebaseAuth";
import { getForumProfile } from "@/lib/server/forum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/discuss/auth/session` — "am I signed in, and as who." Refreshes
 * the ID token first if it's close to expiry, same as the Terminal's own
 * `/api/auth/session` revalidates against the broker rather than trusting a
 * cookie's age — a page that comes back after the token has quietly expired
 * needs to know before it tries to post a reply with it, not after.
 */
export async function GET() {
  const session = decodeForumSession((await cookies()).get(FORUM_SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ authenticated: false });
  }

  try {
    const { refreshed } = await freshIdToken(session);
    const active = refreshed ?? session;
    // A Firestore hiccup reading the profile is not proof the session itself
    // is dead — only `freshIdToken` throwing (below) means that.
    const profile = await getForumProfile(active.uid).catch(() => null);

    const res = NextResponse.json({
      authenticated: true,
      uid: active.uid,
      email: active.email,
      displayName: profile?.displayName ?? active.email.split("@")[0],
      role: profile?.role ?? "member",
    });
    if (refreshed) {
      res.cookies.set(FORUM_SESSION_COOKIE, encodeForumSession(refreshed), FORUM_SESSION_COOKIE_OPTIONS);
    }
    return res;
  } catch {
    // Refresh token itself is dead (revoked, expired past its own ceiling) —
    // the session cookie is no longer honest, so it's cleared rather than
    // left to fail the same way on every future request.
    const res = NextResponse.json({ authenticated: false });
    res.cookies.delete(FORUM_SESSION_COOKIE);
    return res;
  }
}
