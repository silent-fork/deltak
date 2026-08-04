-- Schedules a call to /api/discuss/ingest-feed every 30 minutes.
--
-- Same reasoning as 0007's watchdog-tick schedule: Vercel Cron's Hobby-plan
-- floor is once a day, too coarse for keeping the News category fresh.
-- pg_cron + pg_net are already enabled (0006/0008), so this reuses them
-- rather than needing a Vercel plan upgrade.
--
-- The bearer token is read from Supabase Vault by name at execution time
-- (vault.decrypted_secrets), never inlined here — this file has no secret in
-- it and is safe to have in git history. Create the secret separately, out
-- of band, via:
--
--   select vault.create_secret(
--     '<the same value set as CRON_SECRET in Vercel>',
--     'discuss_ingest_feed_cron_secret',
--     'Bearer token for GET /api/discuss/ingest-feed on Vercel.'
--   );
--
-- Update the `url` below if the production domain ever changes.

select cron.schedule(
  'discuss-ingest-feed',
  '*/30 * * * *',
  $$
  select net.http_get(
    url := 'https://deltak.qntmhrzn.in/api/discuss/ingest-feed',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'discuss_ingest_feed_cron_secret'
      )
    )
  );
  $$
);
