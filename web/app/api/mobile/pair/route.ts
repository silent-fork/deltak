import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isActiveSession } from "@/lib/server/activeSession";
import { startMobilePairing } from "@/lib/server/mobile";
import { SESSION_COOKIE, decodeSession } from "@/lib/server/smartapi";
import { supabaseConfigured } from "@/lib/supabase";

/**
 * `POST /api/mobile/pair` — desktop mints a QR the phone's camera can scan.
 *
 * Only the account's one active trading session may mint one — a superseded
 * tab (see `/api/auth/session`) has no business handing out a claim ticket
 * for a session that's already been signed out from under it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!supabaseConfigured) {
    return NextResponse.json(
      {
        detail:
          "Persistence is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 503 },
    );
  }

  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(
      { detail: "Pairing a phone requires an active SmartAPI session." },
      { status: 401 },
    );
  }
  if (!(await isActiveSession(session.clientCode, session.sessionId))) {
    return NextResponse.json(
      { detail: "This session was signed out — signed in from another window." },
      { status: 401 },
    );
  }

  const { claimUrl, expiresAt, qrSvg } = await startMobilePairing(
    session.clientCode,
    new URL(request.url).origin,
  );

  return NextResponse.json({
    claim_url: claimUrl,
    expires_at: expiresAt,
    qr_svg: qrSvg,
  });
}
