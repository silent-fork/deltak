import { NextResponse } from "next/server";

import {
  FirebaseAuthError,
  FORUM_SESSION_COOKIE,
  FORUM_SESSION_COOKIE_OPTIONS,
  encodeForumSession,
  rateLimitedSignIn,
  type ForumSession,
} from "@/lib/server/firebaseAuth";
import { getForumProfile } from "@/lib/server/forum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
  } | null;

  const email = String(raw?.email ?? "").trim().toLowerCase();
  const password = String(raw?.password ?? "");
  if (!email || !password) {
    return NextResponse.json({ detail: "Email and password are required." }, { status: 400 });
  }

  try {
    const auth = await rateLimitedSignIn(email, password);
    const profile = await getForumProfile(auth.localId);

    const session: ForumSession = {
      uid: auth.localId,
      email: auth.email,
      idToken: auth.idToken,
      refreshToken: auth.refreshToken,
      idTokenExpiresAt: Date.now() + Number(auth.expiresIn) * 1000,
    };

    const res = NextResponse.json({
      uid: auth.localId,
      displayName: profile?.displayName ?? auth.email.split("@")[0],
    });
    res.cookies.set(FORUM_SESSION_COOKIE, encodeForumSession(session), FORUM_SESSION_COOKIE_OPTIONS);
    return res;
  } catch (err) {
    if (err instanceof FirebaseAuthError) {
      // Deliberately the same message for "no such account" and "wrong
      // password" — same reasoning login_failed on the Terminal side never
      // sends its own detail: distinguishing the two for an anonymous
      // caller is exactly what an account-enumeration attack asks for.
      return NextResponse.json({ detail: "Incorrect email or password." }, { status: 401 });
    }
    return NextResponse.json({ detail: "Sign-in failed." }, { status: 502 });
  }
}
