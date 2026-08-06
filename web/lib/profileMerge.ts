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
  /**
   * The paper wallet's own checkpoint — never reported by `getProfile` (the
   * broker has no concept of it), so unlike every other field above there is
   * no "broker wins" case: `stored` is the only source there ever is. Left
   * out of this merge, `broker`'s own `UserProfile` doesn't carry these keys
   * at all, so a spread-then-override merge silently drops them — which is
   * exactly what let `Ledger.restoreWallet`'s `!= null` gate in `useEngine.ts`
   * always see `undefined` and skip the restore on every Angel One session
   * check, regardless of what the checkpoint actually held.
   */
  paper_capital?: number | null;
  paper_charges?: number | null;
  paper_realised_pnl?: number | null;
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
    paper_capital: stored.paper_capital ?? null,
    paper_charges: stored.paper_charges ?? null,
    paper_realised_pnl: stored.paper_realised_pnl ?? null,
  };
}
