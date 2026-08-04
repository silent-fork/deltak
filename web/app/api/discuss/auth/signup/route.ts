import { NextResponse } from "next/server";

import {
  FirebaseAuthError,
  FORUM_SESSION_COOKIE,
  FORUM_SESSION_COOKIE_OPTIONS,
  encodeForumSession,
  rateLimitedSignUp,
  type ForumSession,
} from "@/lib/server/firebaseAuth";
import { createForumProfile, ForumValidationError } from "@/lib/server/forum";

/**
 * `POST /api/discuss/auth/signup` — email/password account creation for
 * `/discuss`. Firebase's own account is created first; the `forumProfiles`
 * doc that gives it a display name is created right after, under the
 * brand-new account's own ID token (Firestore Security Rules require
 * `isOwner(uid)` for that create, so this has to happen in this order and
 * with this token, not a privileged one this app doesn't have).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const raw = (await request.json().catch(() => null)) as {
    email?: unknown;
    password?: unknown;
    displayName?: unknown;
  } | null;

  const email = String(raw?.email ?? "").trim().toLowerCase();
  const password = String(raw?.password ?? "");
  const displayName = String(raw?.displayName ?? "").trim();

  if (!EMAIL_PATTERN.test(email)) {
    return NextResponse.json({ detail: "Enter a valid email address." }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json(
      { detail: "Password must be at least 8 characters." },
      { status: 400 },
    );
  }
  if (displayName.length < 2 || displayName.length > 40) {
    return NextResponse.json(
      { detail: "Display name must be 2–40 characters." },
      { status: 400 },
    );
  }

  try {
    const auth = await rateLimitedSignUp(email, password);
    const profile = await createForumProfile(auth.localId, email, displayName, auth.idToken);

    const session: ForumSession = {
      uid: auth.localId,
      email: auth.email,
      idToken: auth.idToken,
      refreshToken: auth.refreshToken,
      idTokenExpiresAt: Date.now() + Number(auth.expiresIn) * 1000,
    };

    const res = NextResponse.json({ uid: profile.uid, displayName: profile.displayName });
    res.cookies.set(FORUM_SESSION_COOKIE, encodeForumSession(session), FORUM_SESSION_COOKIE_OPTIONS);
    return res;
  } catch (err) {
    if (err instanceof ForumValidationError) {
      return NextResponse.json({ detail: err.message }, { status: 400 });
    }
    if (err instanceof FirebaseAuthError) {
      const detail =
        err.code === "EMAIL_EXISTS"
          ? "An account with that email already exists."
          : err.code?.startsWith("WEAK_PASSWORD")
            ? "Password is too weak."
            : "Sign-up failed.";
      return NextResponse.json({ detail }, { status: 400 });
    }
    return NextResponse.json({ detail: "Sign-up failed." }, { status: 502 });
  }
}
