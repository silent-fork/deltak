import { NextResponse } from "next/server";

import { isCronAuthorised } from "@/lib/server/cronAuth";
import {
  FirebaseAuthError,
  rateLimitedSignIn,
  rateLimitedSignUp,
} from "@/lib/server/firebaseAuth";
import {
  createForumProfile,
  createThread,
  getForumProfile,
  markFeedItemIngested,
  wasFeedItemIngested,
} from "@/lib/server/forum";
import { fetchFeed, FEED_SOURCES, type FeedItem } from "@/lib/server/rssFeed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `GET /api/discuss/ingest-feed` — pulls every configured source in
 * `lib/server/rssFeed.ts`, creates a "feed" thread in Discuss → News for
 * anything not already ingested, and skips the rest.
 *
 * Invoked every 30 minutes by **Supabase's `pg_cron` + `pg_net`**, not
 * Vercel Cron — same reasoning as `/api/watchdog/tick` (see the README's
 * Watchdog section): Vercel's Hobby plan only allows once-a-day schedules,
 * while `pg_cron`/`pg_net` have no such floor on any Supabase plan. See
 * `supabase/migrations/0013` for the schedule itself, which calls this
 * route via `net.http_get`, sending `Authorization: Bearer $CRON_SECRET`
 * read from Supabase Vault (`discuss_ingest_feed_cron_secret`) at execution
 * time. Can still be triggered by hand with the same header for testing.
 *
 * Posts as a dedicated bot account (`DISCUSS_FEED_BOT_EMAIL`/
 * `DISCUSS_FEED_BOT_PASSWORD`) rather than this app's own privileged
 * anything — there is no service-role bypass in `lib/server/forum.ts`
 * (see its header comment), so this route is a normal signed-in writer
 * exactly like a human posting through the UI, just automated. The bot's
 * `forumProfiles` doc needs its `role` set to `moderator` by hand in the
 * Firebase console before `forumFeedItems` (the dedup bookkeeping) is
 * writable — see `firestore.rules`'s own comment on why that grant can't
 * happen through the app itself.
 */

const MAX_NEW_THREADS_PER_SOURCE_PER_RUN = 10;

function formatFeedBody(item: FeedItem, sourceName: string): string {
  const parts = [item.description.trim()].filter(Boolean);
  parts.push(`[Read the full story on ${sourceName} →](${item.link})`);
  return parts.join("\n\n");
}

async function getBotSession() {
  const email = process.env.DISCUSS_FEED_BOT_EMAIL ?? "";
  const password = process.env.DISCUSS_FEED_BOT_PASSWORD ?? "";
  if (!email || !password) {
    throw new Error("DISCUSS_FEED_BOT_EMAIL / DISCUSS_FEED_BOT_PASSWORD not configured.");
  }

  const NOT_FOUND_CODES = new Set([
    "EMAIL_NOT_FOUND",
    "INVALID_PASSWORD",
    "INVALID_LOGIN_CREDENTIALS",
  ]);
  try {
    return await rateLimitedSignIn(email, password);
  } catch (err) {
    if (err instanceof FirebaseAuthError && err.code && NOT_FOUND_CODES.has(err.code)) {
      // First run — the bot account doesn't exist yet.
      return await rateLimitedSignUp(email, password);
    }
    throw err;
  }
}

export async function GET(request: Request) {
  if (!isCronAuthorised(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ detail: "Unauthorized." }, { status: 401 });
  }

  let bot;
  try {
    bot = await getBotSession();
  } catch (err) {
    return NextResponse.json(
      { detail: err instanceof Error ? err.message : "Bot sign-in failed." },
      { status: 502 },
    );
  }

  const profile = await getForumProfile(bot.localId).catch(() => null);
  if (!profile) {
    await createForumProfile(bot.localId, bot.email, "Market Pulse", bot.idToken).catch(() => undefined);
  }

  const results: { source: string; ingested: number; skipped: number; errors: number }[] = [];

  for (const source of FEED_SOURCES) {
    let items: FeedItem[] = [];
    try {
      items = await fetchFeed(source);
    } catch (err) {
      console.error(`[discuss] feed fetch failed for ${source.name}`, err);
      results.push({ source: source.name, ingested: 0, skipped: 0, errors: 1 });
      continue;
    }

    let ingested = 0;
    let skipped = 0;
    let errors = 0;

    for (const item of items) {
      if (ingested >= MAX_NEW_THREADS_PER_SOURCE_PER_RUN) break;
      try {
        const already = await wasFeedItemIngested(item.link, bot.idToken);
        if (already) {
          skipped++;
          continue;
        }
        const { thread } = await createThread(
          "news",
          item.title,
          formatFeedBody(item, source.name),
          { uid: bot.localId, name: source.name },
          bot.idToken,
          "feed",
          { link: item.link, name: source.name },
        );
        await markFeedItemIngested(item.link, thread.id, bot.idToken);
        ingested++;
      } catch (err) {
        console.error(`[discuss] failed to ingest "${item.title}" from ${source.name}`, err);
        errors++;
      }
    }

    results.push({ source: source.name, ingested, skipped, errors });
  }

  return NextResponse.json({ ok: true, results });
}
