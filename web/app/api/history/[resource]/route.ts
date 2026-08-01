import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE, decodeSession } from "@/lib/server/smartapi";
import { isResource, selectFrom, supabaseConfigured } from "@/lib/supabase";

/**
 * `GET /api/history/:resource` — read the persisted ledger from Supabase.
 *
 * Filters are whitelisted rather than passed through: a raw PostgREST query
 * string would let a caller pivot to any column or table the service key can
 * reach.
 *
 * Signing in is required, and the trade tables are scoped to the session's own
 * client code. Without both, a deployment URL is a public trading ledger: the
 * service-role key behind this route bypasses RLS, so this handler is the only
 * thing standing between the ledger and anyone who knows the address.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_LIMIT = 500;

/** Tables carrying an owner column, and therefore readable only by that owner. */
const OWNED = new Set(["positions", "orders"]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ resource: string }> },
) {
  const { resource } = await params;

  const session = decodeSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!session) {
    return NextResponse.json(
      { detail: "History requires an active SmartAPI session." },
      { status: 401 },
    );
  }

  if (!isResource(resource)) {
    return NextResponse.json(
      { detail: `Unknown history resource '${resource}'.` },
      { status: 404 },
    );
  }
  if (!supabaseConfigured) {
    return NextResponse.json(
      {
        detail:
          "Persistence is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const query: Record<string, string> = {};

  if (OWNED.has(resource)) query.client_code = `eq.${session.clientCode}`;

  const limit = Number(url.searchParams.get("limit") ?? 100);
  query.limit = String(
    Number.isFinite(limit) ? Math.min(Math.max(1, Math.trunc(limit)), MAX_LIMIT) : 100,
  );

  const underlying = url.searchParams.get("underlying");
  if (underlying && /^[A-Za-z]+$/.test(underlying)) {
    query.underlying = `eq.${underlying.toUpperCase()}`;
  }
  const status = url.searchParams.get("status");
  if (status === "OPEN" || status === "CLOSED") query.status = `eq.${status}`;
  const kind = url.searchParams.get("kind");
  if (kind && /^[A-Z_]+$/.test(kind)) query.kind = `eq.${kind}`;

  try {
    return NextResponse.json(await selectFrom(resource, query));
  } catch (error) {
    return NextResponse.json(
      { detail: error instanceof Error ? error.message : "Supabase read failed." },
      { status: 502 },
    );
  }
}
