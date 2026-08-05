import "server-only";

import { readProfile, saveProfile, type ProfileRow } from "@/lib/supabase";
import type { UserProfile } from "@/lib/types";

import { profileFromRow } from "./profile";
import type { GenerateTokenResult } from "./dhan";

/**
 * Dhan's counterpart to `lib/server/profile.ts`.
 *
 * `generateAccessToken` already returns the identity fields Angel One's
 * `getProfile` is called separately for (name, UCC, power-of-attorney
 * status), so there is no second round trip here — login normalises and
 * stores what the token call already returned.
 */

export function normaliseDhanProfile(result: GenerateTokenResult): UserProfile {
  return {
    client_code: result.dhanClientId,
    name: result.dhanClientName?.trim() || null,
    email: null,
    mobile_no: null,
    broker: "Dhan",
    // Dhan's token response carries no segment/product enablement list the
    // way Angel One's getProfile does — left empty rather than guessed.
    exchanges: [],
    products: result.givenPowerOfAttorney ? ["DDPI"] : [],
    broker_last_login: null,
  };
}

/** Persist the profile and return what the database now holds — same merge semantics as `rememberProfile`. */
export async function rememberDhanProfile(
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

export async function cachedDhanProfile(clientCode: string): Promise<UserProfile | null> {
  try {
    const row = await readProfile(clientCode);
    return row ? profileFromRow(row as ProfileRow) : null;
  } catch {
    return null;
  }
}
