import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { isActiveSession } from "@/lib/server/activeSession";
import { listPairedDevices, MAX_PAIRED_DEVICES } from "@/lib/server/mobile";
import { SESSION_COOKIE, decodeSession } from "@/lib/server/smartapi";
import { supabaseConfigured } from "@/lib/supabase";

/**
 * `GET /api/mobile/devices` — every phone currently paired to this account,
 * for the desktop profile menu's own device list. Same auth bar as minting a
 * QR (`/api/mobile/pair`): only the account's one active trading session may
 * see or manage its paired phones.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!supabaseConfigured) {
    return NextResponse.json({ devices: [], max_devices: MAX_PAIRED_DEVICES });
  }

  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(
      { detail: "Listing paired phones requires an active SmartAPI session." },
      { status: 401 },
    );
  }
  if (!(await isActiveSession(session.clientCode, session.sessionId))) {
    return NextResponse.json(
      { detail: "This session was signed out — signed in from another window." },
      { status: 401 },
    );
  }

  const devices = await listPairedDevices(session.clientCode);
  return NextResponse.json({
    devices: devices.map((d) => ({
      session_id: d.sessionId,
      paired_at: d.pairedAt,
      last_seen_at: d.lastSeenAt,
    })),
    max_devices: MAX_PAIRED_DEVICES,
  });
}
