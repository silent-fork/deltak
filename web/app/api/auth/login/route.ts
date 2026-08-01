import { NextResponse } from "next/server";

import {
  API_KEY,
  LOGIN_URL,
  SESSION_COOKIE,
  SmartApiError,
  encodeSession,
  smartApiCall,
} from "@/lib/server/smartapi";

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

  let body: { client_code?: string; pin?: string; totp?: string; state?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Malformed request body." }, { status: 400 });
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

    const res = NextResponse.json({
      authenticated: true,
      client_code: clientCode,
      feed_token: data.feedToken,
      api_key: API_KEY,
      state: data.state ?? body.state ?? null,
      login_time: new Date().toISOString().slice(0, 19),
    });

    res.cookies.set(
      SESSION_COOKIE,
      encodeSession({
        jwtToken: data.jwtToken,
        refreshToken: data.refreshToken ?? "",
        clientCode,
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        // SmartAPI sessions expire at midnight IST; this is a generous ceiling.
        maxAge: 60 * 60 * 16,
      },
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
