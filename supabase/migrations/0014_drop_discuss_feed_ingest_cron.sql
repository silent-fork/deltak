-- Unschedules the discuss-ingest-feed job added in 0013.
--
-- The RSS-ingestion feature (/api/discuss/ingest-feed, lib/server/rssFeed.ts,
-- and the forumFeedItems dedup collection) is removed: every invocation
-- since it was scheduled timed out against pg_net's 5s default (bot sign-in
-- + multiple RSS fetches + per-item Firestore writes, done serially, never
-- came close to fitting), so it never once posted a thread in production.
-- The Discuss forum itself (threads, posts, likes, reports) is untouched —
-- this only removes the automated news-bot path.
--
-- Idempotent: cron.unschedule raises if the job name doesn't exist, so this
-- guards the call the same way 0007's watchdog schedule guards cron.schedule.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'discuss-ingest-feed') then
    perform cron.unschedule('discuss-ingest-feed');
  end if;
end $$;
