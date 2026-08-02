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

  try {
    const { claimUrl, expiresAt, qrSvg } = await startMobilePairing(
      session.clientCode,
      new URL(request.url).origin,
    );
    return NextResponse.json({
      claim_url: claimUrl,
      expires_at: expiresAt,
      qr_svg: qrSvg,
    });
  } catch (err) {
    // Almost always migration 0011 not yet applied to this Supabase project —
    // `mobile_pairings` doesn't exist yet, so the write PostgREST issues 404s.
    // Surfacing that as JSON is what turns a bare 500 into an actionable
    // message instead of the generic "Request failed (500)".
    return NextResponse.json(
      {
        detail:
          err instanceof Error
            ? `Pairing failed: ${err.message}`
            : "Pairing failed. Has migration 0011_mobile_companion.sql been applied?",
      },
      { status: 502 },
    );
  }
}
