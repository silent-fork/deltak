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
 * set, a `/terminal?mobile=expired` if the QR was too old to use, or a
 * `/terminal?mobile=limit` if the account already has its three phones paired.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  // A phone that scanned a real QR must never see a raw crash — a claim
  // that fails for any reason (an unapplied migration as much as an
  // expired token) reads the same as "this QR isn't good", not an error.
  const outcome = token
    ? await completeMobilePairing(token).catch(() => ({ status: "invalid" as const }))
    : { status: "invalid" as const };

  const mobileParam =
    outcome.status === "paired" ? "paired" : outcome.status === "limit" ? "limit" : "expired";
  const target = new URL(`/terminal?mobile=${mobileParam}`, request.url);
  const res = NextResponse.redirect(target, { status: 302 });
  if (outcome.status === "paired") {
    res.cookies.set(MOBILE_SESSION_COOKIE, outcome.sessionId, MOBILE_SESSION_COOKIE_OPTIONS);
  }
  return res;
}
