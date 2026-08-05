import { NextResponse } from "next/server";

import { claimActiveSession } from "@/lib/server/activeSession";
import { rememberBrokerSession } from "@/lib/server/brokerSession";
import { generateDhanAccessToken, DhanApiError } from "@/lib/server/dhan";
import { normaliseDhanProfile, rememberDhanProfile } from "@/lib/server/dhanProfile";
import { fetchProfile, rememberProfile } from "@/lib/server/profile";
import {
  API_KEY,
  LOGIN_URL,
  SESSION_COOKIE,
  SESSION_COOKIE_OPTIONS,
  SmartApiError,
  encodeSession,
  smartApiCall,
} from "@/lib/server/smartapi";
import { clientIp, verifyTurnstile } from "@/lib/server/turnstile";

/**
 * `POST /api/auth/login` — Angel One `loginByPassword` or Dhan
 * `generateAccessToken`, chosen by `body.broker`.
 *
 * Both brokers take the same client-code + PIN + TOTP shape, which is what
 * lets the login screen offer a broker toggle over one form rather than two.
 *
 * Credential split, deliberately:
 *  - Angel One's `jwtToken`/`refreshToken` go into an **httpOnly** cookie —
 *    they can place orders, so page JavaScript must never see them. Dhan has
 *    no such split: its single `accessToken` is both trading- and
 *    data-capable, and still has to reach the browser (it opens its own
 *    WebSocket, the same as Angel One's `feedToken` does today) — see
 *    `lib/server/session.ts` for why that's accepted rather than relayed.
 *  - The API key (Angel One) / access token (Dhan) needed for the browser's
 *    own WebSocket is returned in the body, because the browser opens that
 *    socket itself — no server exists to hold it.
 *
 * The TOTP is single-use and transient — forwarded as-is, never stored.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LoginData {
  jwtToken?: string;
  refreshToken?: string;
  feedToken?: string;
  state?: string;
}

export async function POST(request: Request) {
  let body: {
    broker?: string;
    client_code?: string;
    pin?: string;
    totp?: string;
    state?: string;
    turnstile_token?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Malformed request body." }, { status: 400 });
  }

  const broker = body.broker === "dhan" ? "dhan" : "angelone";

  if (broker === "angelone" && !API_KEY) {
    return NextResponse.json(
      {
        detail:
          "Server is not configured with a SmartAPI key. Set DK_API_KEY in the deployment's environment.",
      },
      { status: 503 },
    );
  }

  // Ahead of the credential check, and ahead of any call to the broker: the
  // point is to keep automated attempts away from the broker's rate limits
  // and lockouts, which only works if nothing reaches the broker first.
  const human = await verifyTurnstile(body.turnstile_token, clientIp(request));
  if (!human.ok) {
    return NextResponse.json({ detail: human.detail }, { status: human.status ?? 403 });
  }

  const clientCode = (body.client_code ?? "").trim();
  const pin = (body.pin ?? "").trim();
  const totp = (body.totp ?? "").trim();

  if (clientCode.length < 3 || pin.length < 4 || !/^\d{6}$/.test(totp)) {
    return NextResponse.json(
      { detail: "Client code, PIN and a six-digit TOTP are required." },
      { status: 400 },
    );
  }

  if (broker === "dhan") return loginDhan(clientCode, pin, totp);

  try {
    const data = await smartApiCall<LoginData>(LOGIN_URL, {
      method: "POST",
      body: {
        clientcode: clientCode,
        password: pin,
        totp,
        ...(body.state ? { state: body.state } : {}),
      },
    });

    if (!data.jwtToken || !data.feedToken) {
      return NextResponse.json(
        { detail: "Login succeeded but tokens were missing." },
        { status: 502 },
      );
    }

    const loginAt = new Date().toISOString().slice(0, 19);

    // Never fatal to the login: `.catch` here is the whole failure policy.
    const profile = await fetchProfile(data.jwtToken, clientCode)
      .then((p) => rememberProfile(p, true))
      .catch(() => null);

    // Encrypted, best-effort, and off entirely unless DK_SESSION_ENC_KEY is
    // set — see lib/server/brokerSession.ts. This is what lets a background
    // job read prices or manage positions for this account without a browser
    // tab open; nothing about the cookie above changes.
    await rememberBrokerSession({
      clientCode: profile?.client_code ?? clientCode,
      jwtToken: data.jwtToken,
      refreshToken: data.refreshToken,
      at: new Date(`${loginAt}Z`),
    });

    // Claimed *after* the broker confirms the login, so a rejected TOTP never
    // signs out a session that was still legitimately active elsewhere. This
    // is what makes this window the one, single active session — any other
    // window for this client code fails its next `/api/auth/session` check.
    const sessionId = await claimActiveSession(profile?.client_code ?? clientCode);

    const res = NextResponse.json({
      authenticated: true,
      broker: "angelone",
      client_code: profile?.client_code ?? clientCode,
      feed_token: data.feedToken,
      api_key: API_KEY,
      state: data.state ?? body.state ?? null,
      login_time: loginAt,
      profile,
    });

    res.cookies.set(
      SESSION_COOKIE,
      encodeSession({
        broker: "angelone",
        jwtToken: data.jwtToken,
        refreshToken: data.refreshToken ?? "",
        clientCode,
        feedToken: data.feedToken,
        loginAt,
        sessionId,
      }),
      SESSION_COOKIE_OPTIONS,
    );
    return res;
  } catch (err) {
    const status = err instanceof SmartApiError ? err.status : 502;
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Login failed." },
      { status },
    );
  }
}

/**
 * `generateAccessToken` in place of `loginByPassword`. No `getProfile`
 * follow-up call exists in Dhan's Data API — the token response already
 * carries the identity fields (`dhanClientName`, `dhanClientUcc`,
 * `givenPowerOfAttorney`) Angel One needs a second round trip for.
 */
async function loginDhan(clientCode: string, pin: string, totp: string) {
  try {
    const data = await generateDhanAccessToken({ dhanClientId: clientCode, pin, totp });
    const loginAt = new Date().toISOString().slice(0, 19);

    const profile = await rememberDhanProfile(normaliseDhanProfile(data), true).catch(
      () => normaliseDhanProfile(data),
    );

    const sessionId = await claimActiveSession(data.dhanClientId);

    const res = NextResponse.json({
      authenticated: true,
      broker: "dhan",
      client_code: data.dhanClientId,
      feed_token: data.accessToken,
      api_key: "",
      state: null,
      login_time: loginAt,
      profile,
    });

    res.cookies.set(
      SESSION_COOKIE,
      encodeSession({
        broker: "dhan",
        accessToken: data.accessToken,
        tokenExpiresAt: data.expiryTime,
        clientCode: data.dhanClientId,
        loginAt,
        sessionId,
      }),
      SESSION_COOKIE_OPTIONS,
    );
    return res;
  } catch (err) {
    const status = err instanceof DhanApiError ? err.status : 502;
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Login failed." },
      { status },
    );
  }
}
