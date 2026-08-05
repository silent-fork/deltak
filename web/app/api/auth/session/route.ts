import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isActiveSession } from "@/lib/server/activeSession";
import { rememberBrokerSession } from "@/lib/server/brokerSession";
import { cachedDhanProfile } from "@/lib/server/dhanProfile";
import {
  cachedProfile,
  fetchProfile,
  normaliseProfile,
  rememberProfile,
  type RawProfile,
} from "@/lib/server/profile";
import {
  API_KEY,
  LOGOUT_URL,
  PROFILE_URL,
  REFRESH_URL,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SmartApiError,
  decodeSession,
  encodeSession,
  smartApiCall,
} from "@/lib/server/smartapi";

/**
 * `GET /api/auth/session` — is this browser still signed in, and with what?
 *
 * The trading JWT has always lived in an httpOnly cookie, but the *page* kept
 * the session in React state, so a refresh dropped the operator back to the
 * sign-in screen while a perfectly good session sat in the cookie jar. This is
 * the route that closes that gap.
 *
 * For Angel One it does not take the cookie's word for it: SmartAPI sessions
 * expire daily, so the JWT is put to the broker via `getProfile`, and only a
 * real read counts as signed in — with a `generateTokens` refresh when the
 * JWT has aged out but the refresh token has not. Dhan has no equivalent
 * liveness call in the Data API, so its branch instead checks the access
 * token's own stored `expiryTime` locally — a 24h ceiling with no refresh
 * path, so an expired Dhan session simply asks for a fresh TOTP login.
 *
 * Always 200: "not signed in" is an answer, not a failure, and the page renders
 * a sign-in screen from it rather than an error.
 *
 * Checked before any of that: whether this cookie is still the account's
 * *active* session. A login elsewhere overwrites `client_sessions` with a new
 * id, and a cookie carrying the old one now fails `isActiveSession` — cheaper
 * than a broker round trip, and it is what actually enforces single-active-
 * session rather than merely relying on the broker's own token lifetime.
 *
 * The profile read that proves the JWT is alive is also the profile the HUD
 * shows, so it is kept rather than thrown away: one call, both jobs.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RefreshData {
  jwtToken?: string;
  refreshToken?: string;
  feedToken?: string;
}

const signedOut = (reason: string | null = null) =>
  NextResponse.json({ authenticated: false, reason });

export async function GET() {
  const jar = await cookies();
  const session = decodeSession(jar.get(SESSION_COOKIE)?.value);
  if (!session) return signedOut();

  if (!(await isActiveSession(session.clientCode, session.sessionId))) {
    // Best-effort: invalidate this window's own JWT at the broker too, so a
    // cached copy of it can't keep trading past the point this cookie was
    // told it's done. The window that superseded it already wrote its own
    // token to `broker_sessions` on login — nothing here touches that. Dhan
    // has no documented logout/invalidate endpoint, so its superseded branch
    // just clears the cookie.
    if (session.broker === "angelone") {
      await smartApiCall(LOGOUT_URL, {
        method: "POST",
        jwt: session.jwtToken,
        body: { clientcode: session.clientCode },
      }).catch(() => undefined);
    }
    const res = signedOut("superseded");
    res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  }

  if (session.broker === "dhan") return sessionDhan(session);

  const body = (feedToken: string, loginAt: string | null) => ({
    authenticated: true,
    broker: "angelone",
    client_code: session.clientCode,
    feed_token: feedToken,
    api_key: API_KEY,
    state: null,
    login_time: loginAt ?? new Date().toISOString().slice(0, 19),
  });

  // Cheapest call that proves the JWT is still good — and the profile the HUD
  // renders. A restore is not a fresh login, so it touches the row without
  // counting one.
  try {
    const raw = await smartApiCall<RawProfile>(PROFILE_URL, {
      method: "GET",
      jwt: session.jwtToken,
    });
    const profile = await rememberProfile(
      normaliseProfile(session.clientCode, raw),
      false,
    );
    // The JWT just proved itself alive against the broker — this is the
    // *common* path (most restores don't need SmartAPI's own refresh), so
    // storing here too, not only on login and on refresh, is what keeps
    // broker_sessions from going stale for as long as a tab keeps checking in.
    //
    // `at` is deliberately "now", not `session.loginAt`: this call is
    // confirming the token is alive at this instant, so the stored expiry
    // should be the next midnight IST from *now* — anchoring it to a login
    // that may have been hours ago could compute a boundary already in the
    // past and mark a token that just proved itself good as expired.
    await rememberBrokerSession({
      clientCode: session.clientCode,
      jwtToken: session.jwtToken,
      refreshToken: session.refreshToken,
    });
    return NextResponse.json({
      ...body(session.feedToken ?? "", session.loginAt ?? null),
      profile,
    });
  } catch (err) {
    const expired = err instanceof SmartApiError && err.status === 401;
    if (!expired) {
      // The broker is unreachable or throttling. That is not proof the session
      // died, and signing the operator out over it would be its own outage.
      // The stored profile stands in so the pill does not empty out either.
      return NextResponse.json({
        ...body(session.feedToken ?? "", session.loginAt ?? null),
        profile: await cachedProfile(session.clientCode),
        stale: true,
      });
    }
  }

  if (!session.refreshToken) {
    const res = signedOut("expired");
    res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  }

  try {
    const data = await smartApiCall<RefreshData>(REFRESH_URL, {
      method: "POST",
      body: { refreshToken: session.refreshToken },
      jwt: session.jwtToken,
    });
    if (!data.jwtToken) throw new SmartApiError("Refresh returned no token", 401);

    const loginAt = new Date().toISOString().slice(0, 19);
    const feedToken = data.feedToken ?? session.feedToken ?? "";
    // Renewed tokens, same operator: refresh the profile against the new JWT,
    // but do not count a login the operator did not perform.
    const profile = await fetchProfile(data.jwtToken, session.clientCode)
      .then((p) => rememberProfile(p, false))
      .catch(() => cachedProfile(session.clientCode));

    // Refreshed tokens replace the stored copy the same way they replace the
    // cookie — a new JWT means yesterday's stored one would already be dead.
    await rememberBrokerSession({
      clientCode: session.clientCode,
      jwtToken: data.jwtToken,
      refreshToken: data.refreshToken ?? session.refreshToken,
      at: new Date(`${loginAt}Z`),
    });

    const res = NextResponse.json({
      ...body(feedToken, loginAt),
      profile,
      refreshed: true,
    });
    res.cookies.set(
      SESSION_COOKIE,
      encodeSession({
        broker: "angelone",
        jwtToken: data.jwtToken,
        refreshToken: data.refreshToken ?? session.refreshToken,
        clientCode: session.clientCode,
        feedToken,
        loginAt,
        sessionId: session.sessionId,
      }),
      SESSION_COOKIE_OPTIONS,
    );
    return res;
  } catch {
    const res = signedOut("expired");
    res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  }
}

/**
 * Dhan's branch: no liveness call exists in the Data API, so the access
 * token's own `expiryTime` (stored at login) is the only signal available.
 * There is no refresh path either — an expired token means a fresh TOTP
 * login, not a silent renewal.
 */
async function sessionDhan(session: Extract<import("@/lib/server/session").ServerSession, { broker: "dhan" }>) {
  if (new Date(session.tokenExpiresAt).getTime() <= Date.now()) {
    const res = signedOut("expired");
    res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
    return res;
  }

  const profile = await cachedDhanProfile(session.clientCode);
  return NextResponse.json({
    authenticated: true,
    broker: "dhan",
    client_code: session.clientCode,
    feed_token: session.accessToken,
    api_key: "",
    state: null,
    login_time: session.loginAt ?? new Date().toISOString().slice(0, 19),
    profile,
  });
}
