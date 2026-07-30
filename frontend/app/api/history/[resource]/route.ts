import { NextResponse } from "next/server";

import { isResource, selectFrom, supabaseConfigured } from "@/lib/supabase";

/**
 * `GET /api/history/:resource` — read the persisted ledger straight from
 * Supabase.
 *
 * History is served by Vercel with one hop instead of two, and keeps working
 * when the engine is offline. Live market data still comes from the engine
 * over SSE.
 *
 * Reaching this handler depends on `next.config.mjs` excluding `/api/history/`
 * from the engine rewrite: array-form rewrites are evaluated before *dynamic*
 * routes, so a bare `/api/:path*` would capture this path first.
 *
 * Filters are whitelisted rather than passed through: a raw PostgREST query
 * string would let a caller pivot to any column or table the service key can
 * reach.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_LIMIT = 500;

export async function GET(
  request: Request,
  { params }: { params: { resource: string } },
) {
  const { resource } = params;

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

  const actionable = url.searchParams.get("actionable");
  if (actionable === "true" || actionable === "false") {
    query.actionable = `eq.${actionable}`;
  }

  try {
    return NextResponse.json(await selectFrom(resource, query));
  } catch (error) {
    return NextResponse.json(
      {
        detail: error instanceof Error ? error.message : "Supabase read failed.",
      },
      { status: 502 },
    );
  }
}
