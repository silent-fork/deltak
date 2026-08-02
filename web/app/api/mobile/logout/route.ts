import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  MOBILE_SESSION_COOKIE,
  signOutMobileSession,
} from "@/lib/server/mobile";

/** `POST /api/mobile/logout` — unpair this phone. Re-pairing needs a fresh QR from the desktop. */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const sessionId = (await cookies()).get(MOBILE_SESSION_COOKIE)?.value;
  if (sessionId) await signOutMobileSession(sessionId);

  const res = NextResponse.json({ paired: false });
  res.cookies.set(MOBILE_SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
