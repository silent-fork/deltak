import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/server/smartapi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const res = NextResponse.json({ authenticated: false });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
