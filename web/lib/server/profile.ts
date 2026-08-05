import "server-only";

import { readProfile, saveProfile, type ProfileRow } from "@/lib/supabase";
import type { UserProfile } from "@/lib/types";

import { PROFILE_URL, smartApiCall } from "./smartapi";

/**
 * The operator's identity, from `getProfile` to the HUD by way of Supabase.
 *
 * The profile call was already being made on every session check — it is the
 * cheapest proof a JWT is still alive — and its answer was discarded. Keeping
 * it costs nothing extra on the broker's side and gives the terminal a person
 * to name instead of an eight-character client code.
 *
 * Nothing here is a credential. The tokens that are stay in the httpOnly cookie
 * and are never written to a table.
 */

/** Angel One's field names, which are lower-case and unpunctuated. */
export interface RawProfile {
  clientcode?: string;
  name?: string;
  email?: string;
  mobileno?: string;
  exchanges?: string[] | string;
  products?: string[] | string;
  lastlogintime?: string;
  broker?: string;
}

const text = (value: unknown): string | null => {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed : null;
};

/** Angel One has returned both a JSON array and a comma-joined string here. */
const list = (value: string[] | string | undefined): string[] => {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map((v) => v.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return [];
};

export function normaliseProfile(clientCode: string, raw: RawProfile): UserProfile {
  return {
    // The cookie's client code wins: it is the account whose JWT made the call.
    client_code: text(raw.clientcode) ?? clientCode,
    name: text(raw.name),
    email: text(raw.email),
    mobile_no: text(raw.mobileno),
    broker: text(raw.broker),
    exchanges: list(raw.exchanges),
    products: list(raw.products),
    broker_last_login: text(raw.lastlogintime),
  };
}

/** `getProfile` for a live JWT. Throws `SmartApiError` the way every call does. */
export async function fetchProfile(
  jwt: string,
  clientCode: string,
): Promise<UserProfile> {
  const data = await smartApiCall<RawProfile>(PROFILE_URL, { method: "GET", jwt });
  return normaliseProfile(clientCode, data);
}

/**
 * Persist the profile and return what the database now holds.
 *
 * The returned profile is the merged one, not the broker payload that went in:
 * where `getProfile` reported nothing — an account with no email on file, a
 * contact the operator filled in here by hand — the stored value stands. The
 * HUD therefore renders the same thing a later read would, instead of briefly
 * showing a blank that the next refresh silently fills back in.
 *
 * Best-effort, like every other write on this path: an operator must never be
 * held out of a terminal because a ledger database was briefly unreachable. A
 * failure here downgrades to "we know who you are, we just did not write it
 * down", which the HUD renders identically.
 */
export async function rememberProfile(
  profile: UserProfile,
  fresh: boolean,
): Promise<UserProfile> {
  try {
    const stored = await saveProfile(profile, fresh);
    if (!stored) return profile;
    return { ...stored.profile, first_seen_at: stored.first_seen_at, logins: stored.logins };
  } catch {
    return profile;
  }
}

/**
 * The last profile written for an account.
 *
 * Used when the broker cannot be reached but the session is still trusted: a
 * pill showing yesterday's stored name reads better than one that empties out
 * because Angel One is throttling.
 */
export async function cachedProfile(clientCode: string): Promise<UserProfile | null> {
  try {
    const row = await readProfile(clientCode);
    return row ? profileFromRow(row) : null;
  } catch {
    return null;
  }
}

/** A stored row as the HUD's profile shape. */
export function profileFromRow(row: ProfileRow): UserProfile {
  return {
    client_code: row.client_code,
    name: row.name,
    email: row.email,
    mobile_no: row.mobile_no,
    broker: row.broker,
    exchanges: row.exchanges ?? [],
    products: row.products ?? [],
    broker_last_login: row.broker_last_login,
    first_seen_at: row.first_seen_at ?? null,
    logins: row.logins ?? 0,
    paper_capital: row.paper_capital ?? null,
    paper_charges: row.paper_charges ?? null,
    paper_realised_pnl: row.paper_realised_pnl ?? null,
  };
}
