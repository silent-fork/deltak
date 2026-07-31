import "server-only";

/**
 * Minimal server-side PostgREST client.
 *
 * Deliberately not `@supabase/supabase-js`: this app needs filtered reads and
 * appends over a handful of tables, which `fetch` does with zero added bundle
 * weight and no client runtime.
 *
 * The service-role key bypasses RLS, so this module is `server-only` — importing
 * it from a client component is a build error, not a runtime surprise.
 */

const URL_ENV = process.env.SUPABASE_URL ?? "";
const KEY_ENV = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const supabaseConfigured = Boolean(URL_ENV && KEY_ENV);

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

/** Tables the browser engine may append to. */
export const WRITABLE = {
  positions: "positions",
  orders: "orders",
  events: "risk_events",
  signals: "signals",
} as const;

export type WritableResource = keyof typeof WRITABLE;

export const isResource = (value: string): value is Resource =>
  Object.prototype.hasOwnProperty.call(READABLE, value);

function headers(prefer?: string): Record<string, string> {
  const h: Record<string, string> = {
    apikey: KEY_ENV,
    Authorization: `Bearer ${KEY_ENV}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  if (prefer) h.Prefer = prefer;
  return h;
}

const base = () => `${URL_ENV.replace(/\/$/, "")}/rest/v1`;

export async function selectFrom(
  resource: Resource,
  params: Record<string, string>,
): Promise<unknown[]> {
  if (!supabaseConfigured) throw new Error("Supabase is not configured.");

  const { table, order } = READABLE[resource];
  const search = new URLSearchParams({ select: "*", ...params });
  if (order && !search.has("order")) search.set("order", order);

  const res = await fetch(`${base()}/${table}?${search.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Supabase read failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  const body = await res.json();
  return Array.isArray(body) ? body : [];
}

/**
 * Append rows. Positions are upserted on their ledger id so repeated
 * mark-to-market checkpoints of the same position collapse to one row.
 */
export async function insertRows(
  resource: WritableResource,
  rows: Record<string, unknown>[],
): Promise<number> {
  if (!supabaseConfigured) throw new Error("Supabase is not configured.");
  const table = WRITABLE[resource];
  if (!table) throw new Error(`Resource '${resource}' is not writable.`);

  const upsert = resource === "positions";
  const params = upsert ? "?on_conflict=session_id,ledger_id" : "";
  const prefer = upsert
    ? "resolution=merge-duplicates,return=minimal"
    : "return=minimal";

  const res = await fetch(`${base()}/${table}${params}`, {
    method: "POST",
    headers: headers(prefer),
    body: JSON.stringify(rows),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Supabase write failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  return rows.length;
}
