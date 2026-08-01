/**
 * Vercel Cron's own convention: when `CRON_SECRET` is set in the project's
 * environment, Vercel attaches `Authorization: Bearer <CRON_SECRET>` to every
 * invocation it makes of a scheduled route. Checking it here is what stops
 * anyone else who finds the route's URL from firing paper-position exits on
 * demand.
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
