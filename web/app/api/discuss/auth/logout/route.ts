import { NextResponse } from "next/server";

import { FORUM_SESSION_COOKIE } from "@/lib/server/firebaseAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(FORUM_SESSION_COOKIE);
  return res;
}
