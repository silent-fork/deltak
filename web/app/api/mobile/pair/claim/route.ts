import { NextResponse } from "next/server";

import { MOBILE_SESSION_COOKIE, MOBILE_SESSION_COOKIE_OPTIONS, completeMobilePairing } from "@/lib/server/mobile";

/**
 * `GET /api/mobile/pair/claim` — what the QR actually encodes.
 *
 * This is a route handler, not a page, deliberately: claiming a token is a
 * mutation (it deletes the row), and a Server Component render can be
 * prefetched or re-run in ways a route handler never is. The phone's camera
 * app opens this URL directly — no in-app scanner, no page ever renders
 * here — and lands on a clean `/terminal` with the read-only cookie already
 * set, or a `/terminal?mobile=expired` if the QR was too old to use.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const sessionId = token ? await completeMobilePairing(token) : null;

  const target = new URL(sessionId ? "/terminal" : "/terminal?mobile=expired", request.url);
  const res = NextResponse.redirect(target, { status: 302 });
  if (sessionId) {
    res.cookies.set(MOBILE_SESSION_COOKIE, sessionId, MOBILE_SESSION_COOKIE_OPTIONS);
  }
  return res;
}
