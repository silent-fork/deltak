import "server-only";

import { TABLE_COLUMNS } from "@/lib/engine/persist";
import { mergeProfile } from "@/lib/profileMerge";
import type { Broker, UserProfile } from "@/lib/types";

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
 * Pairing it with the account and the *day* the position opened makes it
 * unique, and — because none of the three ever changes once a position exists —
 * stable: the entry, every mark-to-market checkpoint and the exit all upsert
 * onto one row rather than appending twenty.
 *
 * Deliberately day-precision, not the full timestamp: the exact same instant
 * has reached here as `...T05:29:25Z` on one call (the engine's own
 * timestamp), `...T05:29:25+00:00` on another (Postgres's own rendering of
 * the same `timestamptz`, round-tripped back through a position refresh),
 * and `...T05:29:25.000Z` on a third (`Date.toISOString()`'s own output,
 * which always carries milliseconds a hand-written engine timestamp
 * doesn't) — three different strings for one moment, each computing a
 * different trade key and upserting onto a different row instead of one.
 * `ledger_id` already carries hhmmss precision (unique per account per day
 * on its own), so the date alone is all this needs to add — and unlike
 * second/millisecond-precision formatting, two calls that agree on the
 * calendar day always agree on the string, regardless of which of the three
 * formats above `openedAt` happened to arrive in.
 *
 * Composed here rather than in the browser so it cannot be spoofed into
 * overwriting another account's trade.
 */
export const tradeKey = (clientCode: string, ledgerId: string, openedAt: string) => {
  const ms = Date.parse(openedAt);
  const day = Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : openedAt.slice(0, 10);
  return `${clientCode || "ANON"}|${ledgerId}|${day}`;
};

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
  broker: Broker | null = null,
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
      row.broker = broker;
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

/**
 * Patch a position by its stored `trade_key`, rather than reconstructing one.
 *
 * `insertRows`'s upsert recomputes `trade_key` from `(clientCode, ledgerId,
 * openedAt)` — correct when the caller built `openedAt` itself, but a row read
 * back from Postgres carries `opened_at` in Postgres's own serialisation
 * (`2026-08-01 22:01:48+00`), not the ISO-with-milliseconds string the row was
 * originally written with. Recomputing from that would produce a *different*
 * trade_key and silently insert a second row instead of updating the first.
 * Filtering by the trade_key already on the row sidesteps the mismatch
 * entirely — used by the watchdog, which only ever has rows it read back.
 */
export async function updatePositionByTradeKey(
  tradeKey: string,
  patch: Record<string, unknown>,
): Promise<void> {
  if (!supabaseConfigured || !tradeKey) return;
  const res = await fetch(
    `${base()}/positions?trade_key=eq.${encodeURIComponent(tradeKey)}`,
    {
      method: "PATCH",
      headers: headers("return=minimal"),
      body: JSON.stringify(patch),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(
      `Supabase position update failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  }
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
  paper_capital?: number | null;
  paper_charges?: number | null;
  paper_realised_pnl?: number | null;
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
 * Persist the paper wallet's running totals for one account.
 *
 * A plain last-write-wins PATCH, not an atomic increment: safe because
 * `client_sessions` already enforces a single active session per client
 * code, so there is no concurrent writer to race against. Best-effort like
 * every other write on this path — a failed wallet checkpoint means the next
 * reload starts from the previous one, not that the trade itself is lost.
 */
export async function updateWallet(
  clientCode: string,
  wallet: { capital: number; charges: number; realised: number },
): Promise<void> {
  if (!supabaseConfigured || !clientCode) return;
  const res = await fetch(
    `${base()}/${PROFILES}?client_code=eq.${encodeURIComponent(clientCode)}`,
    {
      method: "PATCH",
      headers: headers("return=minimal"),
      body: JSON.stringify({
        paper_capital: wallet.capital,
        paper_charges: wallet.charges,
        paper_realised_pnl: wallet.realised,
      }),
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(
      `Supabase wallet write failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  }
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

/* ------------------------------------------------------------ broker session */

/**
 * One account's Angel One session, encrypted at rest, for background jobs
 * (the risk watchdog) that need to read market data or manage positions
 * without a browser tab open. Every column here is ciphertext plus the
 * AES-GCM nonce and tag needed to open it — never a usable token. Encryption
 * itself lives in `lib/server/crypto.ts`; this module only ever moves opaque
 * strings in and out of the table, same as every other table here.
 */
export interface BrokerSessionRow {
  client_code: string;
  jwt_ciphertext: string;
  jwt_iv: string;
  jwt_tag: string;
  refresh_ciphertext: string | null;
  refresh_iv: string | null;
  refresh_tag: string | null;
  expires_at: string;
  updated_at: string;
}

const BROKER_SESSIONS = "broker_sessions";

export async function writeBrokerSession(
  row: Omit<BrokerSessionRow, "updated_at">,
): Promise<void> {
  if (!supabaseConfigured) return;
  const res = await fetch(`${base()}/${BROKER_SESSIONS}?on_conflict=client_code`, {
    method: "POST",
    headers: headers("resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify([{ ...row, updated_at: new Date().toISOString() }]),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Supabase broker-session write failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  }
}

export async function readBrokerSession(clientCode: string): Promise<BrokerSessionRow | null> {
  if (!supabaseConfigured || !clientCode) return null;
  const search = new URLSearchParams({
    select: "*",
    client_code: `eq.${clientCode}`,
    limit: "1",
  });
  const res = await fetch(`${base()}/${BROKER_SESSIONS}?${search.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = await res.json();
  return Array.isArray(body) && body.length ? (body[0] as BrokerSessionRow) : null;
}

/** Called on logout, and before a fresh session overwrites a stale one. */
export async function deleteBrokerSession(clientCode: string): Promise<void> {
  if (!supabaseConfigured || !clientCode) return;
  await fetch(`${base()}/${BROKER_SESSIONS}?client_code=eq.${encodeURIComponent(clientCode)}`, {
    method: "DELETE",
    headers: headers("return=minimal"),
    cache: "no-store",
  });
}

/* ------------------------------------------------------------ client session */

const CLIENT_SESSIONS = "client_sessions";

/** Overwrite the account's active session id — what makes the previous window's stale. */
export async function writeClientSession(clientCode: string, sessionId: string): Promise<void> {
  if (!supabaseConfigured || !clientCode) return;
  const res = await fetch(`${base()}/${CLIENT_SESSIONS}?on_conflict=client_code`, {
    method: "POST",
    headers: headers("resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify([{ client_code: clientCode, session_id: sessionId, updated_at: new Date().toISOString() }]),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Supabase client-session write failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  }
}

/** The session id currently on file for an account, or null if none is stored. */
export async function readClientSessionId(clientCode: string): Promise<string | null> {
  if (!supabaseConfigured || !clientCode) return null;
  const search = new URLSearchParams({
    select: "session_id",
    client_code: `eq.${clientCode}`,
    limit: "1",
  });
  const res = await fetch(`${base()}/${CLIENT_SESSIONS}?${search.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = await res.json();
  return Array.isArray(body) && body.length ? ((body[0] as { session_id: string }).session_id ?? null) : null;
}

/** Called on explicit sign-out, so a fresh login is what starts the next session, not a leftover row. */
export async function deleteClientSession(clientCode: string): Promise<void> {
  if (!supabaseConfigured || !clientCode) return;
  await fetch(`${base()}/${CLIENT_SESSIONS}?client_code=eq.${encodeURIComponent(clientCode)}`, {
    method: "DELETE",
    headers: headers("return=minimal"),
    cache: "no-store",
  });
}

/**
 * Wipe this account's paper-trading history — every paper position and
 * order, open or closed. Scoped by both `client_code` and `mode=paper`
 * explicitly: a live-mode row must never be reachable from a "reset my
 * paper wallet" action, whatever else changes about this function later.
 */
export async function resetPaperTrading(clientCode: string): Promise<void> {
  if (!supabaseConfigured || !clientCode) return;
  const search = new URLSearchParams({
    client_code: `eq.${clientCode}`,
    mode: "eq.paper",
  });
  await Promise.all(
    ["positions", "orders"].map((table) =>
      fetch(`${base()}/${table}?${search.toString()}`, {
        method: "DELETE",
        headers: headers("return=minimal"),
        cache: "no-store",
      }),
    ),
  );
}

/* -------------------------------------------------------------- mobile companion */

const MOBILE_PAIRINGS = "mobile_pairings";
const MOBILE_SESSIONS = "mobile_sessions";
const LIVE_SIGNALS = "live_signals";

/** A fresh QR claim ticket replaces whatever this account's last one was. */
export async function createMobilePairing(
  clientCode: string,
  token: string,
  expiresAt: string,
): Promise<void> {
  if (!supabaseConfigured || !clientCode) return;
  // Nothing here needs to survive: a new QR makes any pairing this account
  // hasn't claimed yet moot, and an expired one is dead weight either way.
  await fetch(
    `${base()}/${MOBILE_PAIRINGS}?client_code=eq.${encodeURIComponent(clientCode)}`,
    { method: "DELETE", headers: headers("return=minimal"), cache: "no-store" },
  ).catch(() => undefined);

  const res = await fetch(`${base()}/${MOBILE_PAIRINGS}`, {
    method: "POST",
    headers: headers("return=minimal"),
    body: JSON.stringify([{ token, client_code: clientCode, expires_at: expiresAt }]),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Supabase mobile-pairing write failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  }
}

/**
 * Burn a claim ticket and hand back the account it was minted for.
 *
 * The delete's own filter — unexpired, matching token — is what makes this
 * atomic and single-use: two requests racing on the same token both issue
 * the same `DELETE … RETURNING`, and PostgREST hands the row back to
 * exactly one of them. An expired-but-unclaimed row simply deletes with an
 * empty return, which reads the same as "never existed" to the caller.
 */
export async function claimMobilePairing(token: string): Promise<string | null> {
  if (!supabaseConfigured || !token) return null;
  const search = new URLSearchParams({
    token: `eq.${token}`,
    expires_at: `gt.${new Date().toISOString()}`,
  });
  const res = await fetch(`${base()}/${MOBILE_PAIRINGS}?${search.toString()}`, {
    method: "DELETE",
    headers: headers("return=representation"),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length
    ? ((rows[0] as { client_code: string }).client_code ?? null)
    : null;
}

export async function createMobileSession(clientCode: string, sessionId: string): Promise<void> {
  if (!supabaseConfigured || !clientCode) return;
  const res = await fetch(`${base()}/${MOBILE_SESSIONS}`, {
    method: "POST",
    headers: headers("return=minimal"),
    body: JSON.stringify([{ session_id: sessionId, client_code: clientCode }]),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Supabase mobile-session write failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  }
}

/** The client code a paired phone's cookie belongs to, or null if revoked, expired, or never was. */
export async function readMobileSession(sessionId: string): Promise<string | null> {
  if (!supabaseConfigured || !sessionId) return null;
  const search = new URLSearchParams({
    select: "client_code",
    session_id: `eq.${sessionId}`,
    revoked_at: "is.null",
    limit: "1",
  });
  const res = await fetch(`${base()}/${MOBILE_SESSIONS}?${search.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = await res.json();
  return Array.isArray(body) && body.length
    ? ((body[0] as { client_code: string }).client_code ?? null)
    : null;
}

/**
 * Bumped on every poll from a paired phone, so the desktop's own device list
 * can tell an actually-active phone apart from one that hasn't been opened in
 * weeks — `paired_at` alone can't answer that. Best-effort: a missed touch
 * just means the device list shows an older "last seen" than reality, not a
 * broken session.
 */
export async function touchMobileSession(sessionId: string): Promise<void> {
  if (!supabaseConfigured || !sessionId) return;
  await fetch(
    `${base()}/${MOBILE_SESSIONS}?session_id=eq.${encodeURIComponent(sessionId)}&revoked_at=is.null`,
    {
      method: "PATCH",
      headers: headers("return=minimal"),
      body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
      cache: "no-store",
    },
  ).catch(() => undefined);
}

/** "Sign out this device" — the phone's own cookie stops resolving to anything. */
export async function revokeMobileSession(sessionId: string): Promise<void> {
  if (!supabaseConfigured || !sessionId) return;
  await fetch(`${base()}/${MOBILE_SESSIONS}?session_id=eq.${encodeURIComponent(sessionId)}`, {
    method: "PATCH",
    headers: headers("return=minimal"),
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    cache: "no-store",
  });
}

export interface MobileSessionRow {
  session_id: string;
  created_at: string;
  last_seen_at: string;
}

/** Every phone currently paired to this account, oldest first. */
export async function listMobileSessions(clientCode: string): Promise<MobileSessionRow[]> {
  if (!supabaseConfigured || !clientCode) return [];
  const search = new URLSearchParams({
    select: "session_id,created_at,last_seen_at",
    client_code: `eq.${clientCode}`,
    revoked_at: "is.null",
    order: "created_at.asc",
  });
  const res = await fetch(`${base()}/${MOBILE_SESSIONS}?${search.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const body = await res.json();
  return Array.isArray(body) ? (body as MobileSessionRow[]) : [];
}

/**
 * "Remove this device" from the desktop's side — scoped to `clientCode` so
 * one account can never revoke a phone paired to another. Returns whether a
 * row actually matched: the desktop's list can be a poll or two stale, and a
 * phone that unpaired itself in the meantime should read as "already gone",
 * not an error.
 */
export async function revokeMobileSessionForClient(
  clientCode: string,
  sessionId: string,
): Promise<boolean> {
  if (!supabaseConfigured || !clientCode || !sessionId) return false;
  const search = new URLSearchParams({
    client_code: `eq.${clientCode}`,
    session_id: `eq.${sessionId}`,
    revoked_at: "is.null",
  });
  const res = await fetch(`${base()}/${MOBILE_SESSIONS}?${search.toString()}`, {
    method: "PATCH",
    headers: headers("return=representation"),
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    cache: "no-store",
  });
  if (!res.ok) return false;
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

/** Overwritten on every throttled push from the desktop tab — a mirror, not a log. */
export async function writeLiveSignal(clientCode: string, snapshot: unknown): Promise<void> {
  if (!supabaseConfigured || !clientCode) return;
  const res = await fetch(`${base()}/${LIVE_SIGNALS}?on_conflict=client_code`, {
    method: "POST",
    headers: headers("resolution=merge-duplicates,return=minimal"),
    body: JSON.stringify([{ client_code: clientCode, snapshot, updated_at: new Date().toISOString() }]),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(
      `Supabase live-signal write failed (${res.status}): ${(await res.text()).slice(0, 200)}`,
    );
  }
}

export async function readLiveSignal(
  clientCode: string,
): Promise<{ snapshot: unknown; updated_at: string } | null> {
  if (!supabaseConfigured || !clientCode) return null;
  const search = new URLSearchParams({
    select: "snapshot,updated_at",
    client_code: `eq.${clientCode}`,
    limit: "1",
  });
  const res = await fetch(`${base()}/${LIVE_SIGNALS}?${search.toString()}`, {
    headers: headers(),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = await res.json();
  return Array.isArray(body) && body.length
    ? (body[0] as { snapshot: unknown; updated_at: string })
    : null;
}
