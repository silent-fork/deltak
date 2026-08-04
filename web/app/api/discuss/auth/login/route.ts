import { NextResponse } from "next/server";

import {
  FirebaseAuthError,
  FORUM_SESSION_COOKIE,
  FORUM_SESSION_COOKIE_OPTIONS,
  encodeForumSession,
  rateLimitedSignIn,
  type ForumSession,
} from "@/lib/server/firebaseAuth";
import { getOrRepairForumProfile } from "@/lib/server/forum";

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

  let auth;
  try {
    auth = await rateLimitedSignIn(email, password);
  } catch (err) {
    if (err instanceof FirebaseAuthError) {
      if (err.code === "TOO_MANY_ATTEMPTS_TRY_LATER") {
        return NextResponse.json(
          { detail: "Too many attempts — wait a few minutes and try again." },
          { status: 401 },
        );
      }
      // Deliberately the same message for "no such account" and "wrong
      // password" (Identity Toolkit's own codes for these — EMAIL_NOT_FOUND,
      // INVALID_PASSWORD, or the newer combined INVALID_LOGIN_CREDENTIALS —
      // are folded together here) — same reasoning login_failed on the
      // Terminal side never sends its own detail: distinguishing the two for
      // an anonymous caller is exactly what an account-enumeration attack asks for.
      return NextResponse.json({ detail: "Incorrect email or password." }, { status: 401 });
    }
    console.error("[discuss] signIn failed", err);
    return NextResponse.json({ detail: "Sign-in failed — try again in a moment." }, { status: 502 });
  }

  // The credentials above already checked out — a Firestore hiccup reading
  // (or repairing) the display name is not a reason to tell the caller
  // sign-in failed.
  const profile = await getOrRepairForumProfile(auth.localId, auth.email, auth.idToken).catch(
    (err) => {
      console.error("[discuss] forumProfiles read failed after a successful signIn", err);
      return null;
    },
  );

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
}
