import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { pushLiveSignal } from "@/lib/server/mobile";
import { SESSION_COOKIE, decodeSession } from "@/lib/server/smartapi";

/**
 * `POST /api/mobile/push` — the desktop tab's throttled mirror of its own
 * signal state, for a paired phone to read back.
 *
 * Deliberately not gated by `isActiveSession`: this is a low-stakes mirror,
 * not an order, and it runs on a five-second client-side throttle for as
 * long as a tab is open — worth one cheap cookie decode, not an extra
 * database round trip every single push. A superseded tab stops pushing
 * anything useful the moment its own `/api/auth/session` poll signs it out.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ detail: "No active SmartAPI session." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Malformed request body." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ detail: "Expected a JSON object." }, { status: 400 });
  }

  await pushLiveSignal(session.clientCode, body);
  return NextResponse.json({ ok: true });
}
