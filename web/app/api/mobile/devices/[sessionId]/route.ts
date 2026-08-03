import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isActiveSession } from "@/lib/server/activeSession";
import { removePairedDevice } from "@/lib/server/mobile";
import { SESSION_COOKIE, decodeSession } from "@/lib/server/smartapi";
import { supabaseConfigured } from "@/lib/supabase";

/**
 * `DELETE /api/mobile/devices/:sessionId` — unpair one phone from the
 * desktop's own profile menu, freeing a slot toward the three-device cap.
 * Scoped to the signed-in account server-side (`removePairedDevice` filters
 * on `clientCode`), so this can never revoke a phone paired to another one.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const { sessionId } = await params;

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
      { detail: "Removing a paired phone requires an active SmartAPI session." },
      { status: 401 },
    );
  }
  if (!(await isActiveSession(session.clientCode, session.sessionId))) {
    return NextResponse.json(
      { detail: "This session was signed out — signed in from another window." },
      { status: 401 },
    );
  }

  const removed = await removePairedDevice(session.clientCode, sessionId);
  return NextResponse.json({ removed });
}
