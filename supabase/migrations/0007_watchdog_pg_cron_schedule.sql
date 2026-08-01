-- Schedules the once-a-minute call to /api/watchdog/tick.
--
-- The bearer token is read from Supabase Vault by name at execution time
-- (vault.decrypted_secrets), never inlined here — this file has no secret in
-- it and is safe to have in git history. The secret itself is created
-- separately, out of band, via:
--
--   select vault.create_secret(
--     '<the same value set as CRON_SECRET in Vercel>',
--     'watchdog_cron_secret',
--     'Bearer token for GET /api/watchdog/tick on Vercel.'
--   );
--
-- Update the `url` below if the production domain ever changes.

select cron.schedule(
  'watchdog-tick',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://deltak.qntmhrzn.in/api/watchdog/tick',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'watchdog_cron_secret'
      )
    )
  );
  $$
);
