import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE, decodeSession } from "@/lib/server/smartapi";
import { supabaseConfigured, updateWallet } from "@/lib/supabase";

/**
 * `POST /api/wallet` — checkpoint the paper wallet's running totals.
 *
 * Fired after every entry, exit and scale-out so the Paper Wallet card
 * reflects capital/charges/booked P&L from the account's whole history
 * rather than resetting to the default starting capital on every fresh
 * login — see `Ledger.restoreWallet` for the read side. Best-effort like
 * `/api/persist`: a write here must never block or delay a trading decision,
 * so the client fires it without awaiting and a failure here is not an error
 * state for the HUD.
 *
 * Like `/api/persist`, attribution comes from the session cookie, never the
 * body: a request can only checkpoint the wallet of the account whose
 * session sent it.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const num = (value: unknown): number | null => {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
};

export async function POST(request: Request) {
  if (!supabaseConfigured) {
    return NextResponse.json({ detail: "Persistence is not configured." }, { status: 503 });
  }

  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json({ detail: "Wallet checkpoint requires an active session." }, { status: 401 });
  }

  let body: { capital?: unknown; charges?: unknown; realised?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Malformed request body." }, { status: 400 });
  }

  const capital = num(body.capital);
  const charges = num(body.charges);
  const realised = num(body.realised);
  if (capital === null || charges === null || realised === null) {
    return NextResponse.json(
      { detail: "capital, charges and realised must all be finite numbers." },
      { status: 400 },
    );
  }

  try {
    await updateWallet(session.clientCode, { capital, charges, realised });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Supabase write failed." },
      { status: 502 },
    );
  }
}
