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

  let auth;
  try {
    auth = await rateLimitedSignUp(email, password);
  } catch (err) {
    if (err instanceof FirebaseAuthError) {
      const detail =
        err.code === "EMAIL_EXISTS"
          ? "An account with that email already exists."
          : err.code === "INVALID_EMAIL"
            ? "Enter a valid email address."
            : err.code?.startsWith("WEAK_PASSWORD")
              ? "Password is too weak — use at least 8 characters with a mix of letters and numbers."
              : err.code === "TOO_MANY_ATTEMPTS_TRY_LATER"
                ? "Too many attempts — wait a few minutes and try again."
                : "Sign-up failed.";
      return NextResponse.json({ detail }, { status: 400 });
    }
    console.error("[discuss] signUp failed", err);
    return NextResponse.json({ detail: "Sign-up failed — try again in a moment." }, { status: 502 });
  }

  // The Firebase Auth account above is now real regardless of what happens
  // next — a failure creating its `forumProfiles` doc (Firestore down, or
  // its rules not yet deployed) must not be reported as "sign-up failed"
  // when sign-up, the thing this endpoint is actually for, already
  // succeeded. The account is left with no stored display name until this
  // is retried (see `getForumProfile`'s callers, which all fall back to the
  // email's local part) rather than the operator finding an account in the
  // Firebase console that the app insists doesn't exist.
  const profile = await createForumProfile(auth.localId, email, displayName, auth.idToken).catch(
    (err) => {
      if (!(err instanceof ForumValidationError)) {
        console.error("[discuss] forumProfiles create failed after a successful signUp", err);
      }
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

  const res = NextResponse.json({ uid: auth.localId, displayName: profile?.displayName ?? displayName });
  res.cookies.set(FORUM_SESSION_COOKIE, encodeForumSession(session), FORUM_SESSION_COOKIE_OPTIONS);
  return res;
}
