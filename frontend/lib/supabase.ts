import "server-only";

/**
 * Minimal server-side PostgREST client.
 *
 * Deliberately not `@supabase/supabase-js`: the only thing the HUD needs from
 * Supabase is a filtered read of six tables, and a `fetch` wrapper does that
 * with zero added bundle weight and no client runtime.
 *
 * The service-role key bypasses RLS, so this module is `server-only` — importing
 * it from a client component is a build error, not a runtime surprise.
 */

const URL_ENV = process.env.SUPABASE_URL ?? "";
const KEY_ENV = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** Tables the HUD may read. Anything not listed here is rejected outright. */
export const READABLE = {
  sessions: { table: "trading_sessions", order: "started_at.desc" },
  orders: { table: "orders", order: "created_at.desc" },
  positions: { table: "positions", order: "opened_at.desc" },
  signals: { table: "signals", order: "captured_at.desc" },
  events: { table: "risk_events", order: "ts.desc" },
  performance: { table: "session_performance", order: "" },
} as const;

export type Resource = keyof typeof READABLE;

export const isResource = (value: string): value is Resource =>
  Object.prototype.hasOwnProperty.call(READABLE, value);

export const supabaseConfigured = Boolean(URL_ENV && KEY_ENV);

export async function selectFrom(
  resource: Resource,
  params: Record<string, string>,
): Promise<unknown[]> {
  if (!supabaseConfigured) {
    throw new Error(
      "Supabase is not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  const { table, order } = READABLE[resource];
  const search = new URLSearchParams({ select: "*", ...params });
  if (order && !search.has("order")) search.set("order", order);

  const res = await fetch(
    `${URL_ENV.replace(/\/$/, "")}/rest/v1/${table}?${search.toString()}`,
    {
      headers: {
        apikey: KEY_ENV,
        Authorization: `Bearer ${KEY_ENV}`,
        Accept: "application/json",
      },
      cache: "no-store",
    },
  );

  if (!res.ok) {
    throw new Error(
      `Supabase read failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  }
  const body = await res.json();
  return Array.isArray(body) ? body : [];
}
