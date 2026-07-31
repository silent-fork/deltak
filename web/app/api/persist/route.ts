import { NextResponse } from "next/server";

import { insertRows, supabaseConfigured, type WritableResource } from "@/lib/supabase";

/**
 * `POST /api/persist` — append engine records to Supabase.
 *
 * The browser engine is the source of truth while a tab is open; this makes the
 * ledger survive a refresh. Writes are best-effort by design: a persistence
 * failure must never block or delay a trading decision, so the client fires
 * these without awaiting them and a 503 here is not an error state for the HUD.
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

  const resource = body.resource as WritableResource;
  const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : [];
  if (!rows.length) return NextResponse.json({ persisted: 0 });

  try {
    const persisted = await insertRows(resource, rows as Record<string, unknown>[]);
    return NextResponse.json({ persisted });
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Supabase write failed." },
      { status: 502 },
    );
  }
}
