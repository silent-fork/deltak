import { NextResponse } from "next/server";

import { rememberBrokerSession } from "@/lib/server/brokerSession";
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
 * `POST /api/auth/login` — Angel One loginByPassword.
 *
 * Credential split, deliberately:
 *  - `jwtToken` / `refreshToken` go into an **httpOnly** cookie. These can place
 *    orders, so page JavaScript must never see them.
 *  - `feedToken` and the API key are returned in the body, because the browser
 *    opens the SmartStream WebSocket itself (no server exists to hold it). Both
 *    are market-data scoped: they subscribe to quotes, they cannot trade.
 *
 * The TOTP is single-use and transient — forwarded as-is, never stored.
 *
 * A `getProfile` follows the token exchange so the terminal opens knowing who
 * is at it. That profile is written to Supabase and returned in the body; if
 * either step fails the login still succeeds, because an operator locked out of
 * a trading screen by a directory lookup is a worse outcome than a nameless
 * one.
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
  if (!API_KEY) {
    return NextResponse.json(
      {
        detail:
          "Server is not configured with a SmartAPI key. Set DK_API_KEY in the deployment's environment.",
      },
      { status: 503 },
    );
  }

  let body: {
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

  // Ahead of the credential check, and ahead of any call to the broker: the
  // point is to keep automated attempts away from Angel One's rate limits and
  // lockouts, which only works if nothing reaches Angel One first.
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

    const res = NextResponse.json({
      authenticated: true,
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
        jwtToken: data.jwtToken,
        refreshToken: data.refreshToken ?? "",
        clientCode,
        feedToken: data.feedToken,
        loginAt,
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
