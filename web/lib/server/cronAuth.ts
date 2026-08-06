/**
 * A plain bearer-token check, `Authorization: Bearer <CRON_SECRET>` —
 * not Vercel Cron's own convention (this app has none; there is no
 * `vercel.json` cron entry). The actual caller is Supabase's `pg_cron` +
 * `pg_net`, which attaches this same header from a Vault-stored secret on
 * every scheduled `net.http_get` call to `/api/watchdog/tick` — see that
 * route's own comment. Checking it here is what stops anyone else who finds
 * the route's URL from firing paper-position exits on demand.
 *
 * Kept out of `server-only` and out of the route file itself so a plain test
 * can hold it to its own logic without a Next.js request/response runtime.
 */
export function isCronAuthorised(
  authorizationHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret) return false; // unset means the watchdog route is off, not open
  return authorizationHeader === `Bearer ${secret}`;
}
