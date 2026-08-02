import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { MOBILE_SESSION_COOKIE, mobileSessionClientCode } from "@/lib/server/mobile";
import { readLiveSignal, selectFrom, supabaseConfigured } from "@/lib/supabase";

/**
 * `GET /api/mobile/state` — everything the read-only companion shows.
 *
 * Never imports `lib/server/smartapi.ts`: this route cannot call Angel One
 * even by accident, because nothing here holds a JWT to call it with. A
 * paired phone reads exactly two things, both already scoped to this
 * account's client code — the desktop's last pushed signal snapshot, and its
 * recent positions (open and closed both; the client separates them).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (!supabaseConfigured) {
    return NextResponse.json({ detail: "Persistence is not configured." }, { status: 503 });
  }

  const sessionId = (await cookies()).get(MOBILE_SESSION_COOKIE)?.value;
  const clientCode = await mobileSessionClientCode(sessionId);
  if (!clientCode) {
    return NextResponse.json({ detail: "This phone isn't paired." }, { status: 401 });
  }

  const [signalRow, positions] = await Promise.all([
    readLiveSignal(clientCode),
    selectFrom("positions", { client_code: `eq.${clientCode}`, limit: "50" }).catch(() => []),
  ]);

  return NextResponse.json({
    client_code: clientCode,
    signal: signalRow?.snapshot ?? null,
    signal_updated_at: signalRow?.updated_at ?? null,
    positions,
  });
}
