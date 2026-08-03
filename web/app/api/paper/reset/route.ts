import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isActiveSession } from "@/lib/server/activeSession";
import { SESSION_COOKIE, decodeSession } from "@/lib/server/smartapi";
import { resetPaperTrading, supabaseConfigured } from "@/lib/supabase";

/**
 * `POST /api/paper/reset` — wipe this account's paper-trading history.
 *
 * Only the account's one active trading session may fire this, same bar as
 * placing an order — a destructive, account-wide action has no business
 * being reachable from a superseded tab.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
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
      { detail: "Resetting the paper wallet requires an active SmartAPI session." },
      { status: 401 },
    );
  }
  if (!(await isActiveSession(session.clientCode, session.sessionId))) {
    return NextResponse.json(
      { detail: "This session was signed out — signed in from another window." },
      { status: 401 },
    );
  }

  await resetPaperTrading(session.clientCode);
  return NextResponse.json({ ok: true });
}
