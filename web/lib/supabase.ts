import "server-only";

import { TABLE_COLUMNS } from "@/lib/engine/persist";
import { mergeProfile } from "@/lib/profileMerge";
import type { UserProfile } from "@/lib/types";

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

/**
 * Tables the HUD may read back. Anything not listed here is rejected outright.
 *
 * `user_profiles` is deliberately absent: it holds an email and a phone number,
 * and history reads are scoped by client code rather than owned by one. The
 * profile has its own route, which answers for the signed-in session only.
 */
export const READABLE = {
  orders: { table: "orders", order: "created_at.desc" },
  positions: { table: "positions", order: "opened_at.desc" },
  events: { table: "risk_events", order: "ts.desc" },
} as const;

export type Resource = keyof typeof READABLE;

/** Tables the browser engine may append to. */
export const WRITABLE = {
  positions: "positions",
  orders: "orders",
  events: "risk_events",
} as const;

export type WritableResource = keyof typeof WRITABLE;

/**
 * Rows arrive from the browser as engine objects, and PostgREST rejects the
 * *whole batch* over one unknown key — which is how position writes managed to
 * fail silently for as long as they did (the ledger's `id` is not the table's).
 * Projecting onto the known columns means a new engine field can never take
 * persistence down with it: it is dropped, and everything else still lands.
 */
const COLUMNS: Record<WritableResource, readonly string[]> = TABLE_COLUMNS;

export const isResource = (value: string): value is Resource =>
  Object.prototype.hasOwnProperty.call(READABLE, value);

export const isWritable = (value: string): value is WritableResource =>
  Object.prototype.hasOwnProperty.call(WRITABLE, value);

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

const pick = (row: Record<string, unknown>, allowed: readonly string[]) => {
  const out: Record<string, unknown> = {};
  for (const key of allowed) if (row[key] !== undefined) out[key] = row[key];
  return out;
};

/**
 * The identity of one trade, across its whole life.
 *
 * A ledger id restarts at `DK-hhmmss-001` in every browser tab, so on its own it
 * would collide between two operators, or between today's book and tomorrow's.
 * Pairing it with the account and the moment the position opened makes it
 * unique, and — because none of the three ever changes once a position exists —
 * stable: the entry, every mark-to-market checkpoint and the exit all upsert
 * onto one row rather than appending twenty.
 *
 * Composed here rather than in the browser so it cannot be spoofed into
 * overwriting another account's trade.
 */
export const tradeKey = (clientCode: string, ledgerId: string, openedAt: string) =>
  `${clientCode || "ANON"}|${ledgerId}|${openedAt}`;

/**
 * Append rows on behalf of one account.
 *
 * Positions are upserted on their trade key so repeated checkpoints of the same
 * position collapse to one row; orders and events are append-only.
 */
export async function insertRows(
  resource: WritableResource,
  rows: Record<string, unknown>[],
  clientCode: string,
): Promise<number> {
  if (!supabaseConfigured) throw new Error("Supabase is not configured.");
  const table = WRITABLE[resource];
  if (!table) throw new Error(`Resource '${resource}' is not writable.`);

  const owned = rows.map((raw) => {
    const row = pick(raw, COLUMNS[resource]);
    // Attribution is stamped from the session cookie, never taken from the
    // request body: the browser says what it traded, not who it traded as.
    if (resource === "positions" || resource === "orders") {
      row.client_code = clientCode || null;
    }
    if (resource === "positions") {
      row.trade_key = tradeKey(
        clientCode,
        String(row.ledger_id ?? ""),
        String(row.opened_at ?? ""),
      );
    }
    return row;
  });

  const upsert = resource === "positions";
  const params = upsert ? "?on_conflict=trade_key" : "";
  const prefer = upsert
    ? "resolution=merge-duplicates,return=minimal"
    : "return=minimal";

  const res = await fetch(`${base()}/${table}${params}`, {
    method: "POST",
    headers: headers(prefer),
    body: JSON.stringify(owned),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Supabase write failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  }
  return owned.length;
}

/* ------------------------------------------------------------ user profile */

export interface ProfileRow {
  client_code: string;
  name: string | null;
  email: string | null;
  mobile_no: string | null;
  broker: string | null;
  exchanges: string[] | null;
  products: string[] | null;
  broker_last_login: string | null;
  first_seen_at?: string | null;
  last_login_at?: string | null;
  logins?: number | null;
}

const PROFILES = "user_profiles";

/** The stored profile for one account, or null if it has never signed in here. */
export async function readProfile(clientCode: string): Promise<ProfileRow | null> {
  if (!supabaseConfigured || !clientCode) return null;
  const search = new URLSearchParams({
    select: "*",
    client_code: `eq.${clientCode}`,
    limit: "1",
  });
  const res = await fetch(`${base()}/${PROFILES}?${search.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = await res.json();
  return Array.isArray(body) && body.length ? (body[0] as ProfileRow) : null;
}

/**
 * Write the operator's profile through.
 *
 * `fresh` marks an actual sign-in rather than a session revalidation: it moves
 * `last_login_at` and counts the login. A revalidation happens every fifteen
 * minutes while a tab is open, and counting those would make the number
 * meaningless.
 *
 * Returns the row as it now stands — merged, not merely what the broker sent —
 * so the caller hands the HUD the same profile the database holds rather than
 * one that disagrees with it until the next read.
 */
export async function saveProfile(
  profile: UserProfile,
  fresh: boolean,
): Promise<{ profile: UserProfile; first_seen_at: string | null; logins: number } | null> {
  if (!supabaseConfigured || !profile.client_code) return null;

  const existing = await readProfile(profile.client_code);
  const merged = mergeProfile(profile, existing);
  const now = new Date().toISOString();
  const logins = (existing?.logins ?? 0) + (fresh ? 1 : 0);

  const row: Record<string, unknown> = {
    client_code: merged.client_code,
    name: merged.name,
    email: merged.email,
    mobile_no: merged.mobile_no,
    broker: merged.broker,
    exchanges: merged.exchanges,
    products: merged.products,
    broker_last_login: merged.broker_last_login,
    last_seen_at: now,
    logins,
  };
  if (fresh) row.last_login_at = now;

  const res = await fetch(`${base()}/${PROFILES}?on_conflict=client_code`, {
    method: "POST",
    headers: headers("resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify([row]),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Supabase profile write failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  }
  return { profile: merged, first_seen_at: existing?.first_seen_at ?? now, logins };
}

/**
 * Overwrite the operator's contact details.
 *
 * Angel One's own API has no endpoint to change them — `email` and `mobileno`
 * on `getProfile` are the broker's KYC record, not something SmartAPI accepts
 * writes for. This edits only this terminal's copy, e.g. to correct what the
 * broker returned or to add a contact the account was opened without. It never
 * claims to be pushing the change back to Angel One.
 */
export async function updateProfileContact(
  clientCode: string,
  patch: { email?: string | null; mobile_no?: string | null },
): Promise<ProfileRow> {
  if (!supabaseConfigured || !clientCode) throw new Error("Supabase is not configured.");

  const row: Record<string, unknown> = { last_seen_at: new Date().toISOString() };
  if ("email" in patch) row.email = patch.email;
  if ("mobile_no" in patch) row.mobile_no = patch.mobile_no;

  // `return=representation` is what makes a no-match visible: PostgREST answers
  // a PATCH that matched nothing with 200 and an empty array, so asking for the
  // rows back is the only way to tell "updated" from "silently did nothing".
  const res = await fetch(
    `${base()}/${PROFILES}?client_code=eq.${encodeURIComponent(clientCode)}`,
    {
      method: "PATCH",
      headers: headers("return=representation"),
      body: JSON.stringify(row),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(
      `Supabase profile update failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  }

  const updated = await res.json();
  if (Array.isArray(updated) && updated.length) return updated[0] as ProfileRow;

  // No row to patch: the account has signed in but the profile write never
  // landed — Supabase was unreachable at the time, or this is an older session
  // from before profiles were stored. Create it rather than reporting success
  // for a write that changed nothing.
  const created = await fetch(`${base()}/${PROFILES}?on_conflict=client_code`, {
    method: "POST",
    headers: headers("resolution=merge-duplicates,return=representation"),
    body: JSON.stringify([{ client_code: clientCode, ...row }]),
    cache: "no-store",
  });
  if (!created.ok) {
    throw new Error(
      `Supabase profile insert failed (${created.status}): ${(await created.text()).slice(0, 200)}`,
    );
  }
  const rows = await created.json();
  if (!Array.isArray(rows) || !rows.length) {
    throw new Error("Supabase accepted the profile write but returned no row.");
  }
  return rows[0] as ProfileRow;
}
