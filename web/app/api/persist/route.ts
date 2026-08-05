import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE, decodeSession } from "@/lib/server/smartapi";
import { insertRows, isWritable, supabaseConfigured } from "@/lib/supabase";

/**
 * `POST /api/persist` — append engine records to Supabase.
 *
 * The browser engine is the source of truth while a tab is open; this makes the
 * ledger survive a refresh. Writes are best-effort by design: a persistence
 * failure must never block or delay a trading decision, so the client fires
 * these without awaiting them and a 503 here is not an error state for the HUD.
 *
 * Trades are attributed here rather than by the caller. The client code and
 * broker come out of the httpOnly session cookie, so a row can only be filed
 * under the account — and the broker — whose session wrote it, and a body
 * claiming otherwise is overwritten, not trusted. A paper trade taken with no
 * broker session files under no account, which is exactly what it is.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_ROWS = 200;

export async function POST(request: Request) {
  if (!supabaseConfigured) {
    return NextResponse.json(
      { detail: "Persistence is not configured.", persisted: 0 },
      { status: 503 },
    );
  }

  let body: { resource?: string; rows?: unknown[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Malformed request body." }, { status: 400 });
  }

  const resource = body.resource ?? "";
  if (!isWritable(resource)) {
    return NextResponse.json(
      { detail: `Resource '${resource}' is not writable.` },
      { status: 400 },
    );
  }

  const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : [];
  if (!rows.length) return NextResponse.json({ persisted: 0 });

  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);

  try {
    const persisted = await insertRows(
      resource,
      rows as Record<string, unknown>[],
      session?.clientCode ?? "",
      session?.broker ?? null,
    );
    return NextResponse.json({ persisted });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Supabase write failed." },
      { status: 502 },
    );
  }
}
