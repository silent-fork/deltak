-- Delta-K Terminal — Supabase-side trigger for the watchdog tick.
--
-- Vercel Cron's minimum interval is once a day on the Hobby plan (once a
-- minute needs Pro). pg_cron + pg_net are plain Postgres extensions, billed
-- the same on every Supabase plan, and pg_cron's own floor is the same
-- once-a-minute every other cron implementation has — so this replaces
-- Vercel Cron as the trigger for /api/watchdog/tick without needing a paid
-- plan on either side. The route itself, its logic and its CRON_SECRET check
-- are unchanged; only what calls it moves.

create extension if not exists pg_cron;
create extension if not exists pg_net;
