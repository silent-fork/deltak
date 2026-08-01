import type { UserProfile } from "./types";

/**
 * Reconciling the broker's view of an account with this terminal's own.
 *
 * Pure, and deliberately outside `supabase.ts`: that module is `server-only`,
 * which is right for anything holding the service-role key and wrong for a
 * rule this worth testing directly.
 */

/** The stored columns this rule reads. A subset of the `user_profiles` row. */
export interface StoredContact {
  name: string | null;
  email: string | null;
  mobile_no: string | null;
  broker: string | null;
  exchanges: string[] | null;
  products: string[] | null;
  broker_last_login: string | null;
}

/**
 * `getProfile` does not always carry every field — an account opened without an
 * email reports none, and `broker` comes back null more often than not. Writing
 * those straight through blanked whatever was stored, which is what made a
 * manually-entered email vanish on the next session check fifteen minutes
 * later: the edit landed, and then the next revalidation overwrote it with the
 * broker's silence.
 *
 * So: the broker wins wherever it actually reported something — it is the
 * authoritative record — and a field it did not report keeps its last known
 * value. Arrays follow the same rule, empty standing in for absent.
 */
export function mergeProfile(
  broker: UserProfile,
  stored: StoredContact | null,
): UserProfile {
  if (!stored) return broker;
  return {
    ...broker,
    name: broker.name ?? stored.name,
    email: broker.email ?? stored.email,
    mobile_no: broker.mobile_no ?? stored.mobile_no,
    broker: broker.broker ?? stored.broker,
    exchanges: broker.exchanges.length ? broker.exchanges : (stored.exchanges ?? []),
    products: broker.products.length ? broker.products : (stored.products ?? []),
    broker_last_login: broker.broker_last_login ?? stored.broker_last_login,
  };
}
