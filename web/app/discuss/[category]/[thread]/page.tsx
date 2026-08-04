import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DiscussChrome } from "@/components/discuss/DiscussChrome";
import { PostView } from "@/components/discuss/PostView";
import { ReplyForm } from "@/components/discuss/ReplyForm";
import { ShareButtons } from "@/components/discuss/ShareButtons";
import { getForumCategory } from "@/lib/content/forumCategories";
import { getViewerIdentity } from "@/lib/server/firebaseAuth";
import { getThread, listPosts } from "@/lib/server/forum";
import { timeAgo } from "@/lib/utils";

const SITE_URL =
  process.env.NEXT_PUBLIC_DK_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/**
 * A stable, deterministic pick from the terminal's own three semantic
 * accents (quantum/aegis/zenith — the same trio the option chain already
 * uses for wall/rotation color-coding) — not per-role or per-status,
 * purely so the avatar rail reads as more than one undifferentiated teal
 * dot per commenter.
 */
const AVATAR_ACCENTS = [
  { border: "border-quantum/30", bg: "bg-quantum/10", text: "text-quantum" },
  { border: "border-aegis/30", bg: "bg-aegis/10", text: "text-aegis" },
  { border: "border-zenith/30", bg: "bg-zenith/10", text: "text-zenith" },
] as const;

function avatarAccent(name: string) {
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
  return AVATAR_ACCENTS[sum % AVATAR_ACCENTS.length];
}

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string; thread: string }>;
}): Promise<Metadata> {
  const { category, thread: threadId } = await params;
  // Metadata generation runs outside the page component's own render tree —
  // `app/discuss/error.tsx`'s boundary doesn't reach a throw here, so this
  // needs its own guard rather than relying on that backstop.
  const thread = await getThread(threadId).catch(() => null);
  if (!thread) return {};
  return {
    title: `${thread.title} — Discuss`,
    description: thread.title,
    alternates: { canonical: `/discuss/${category}/${threadId}` },
    robots: { index: true, follow: true },
  };
}

export default async function DiscussThreadPage({
  params,
}: {
  params: Promise<{ category: string; thread: string }>;
}) {
  const { category, thread: threadId } = await params;
  const cat = getForumCategory(category);
  if (!cat) notFound();

  // A genuine 404 (`getThread` resolves to `null`) is a different outcome
  // from Firestore itself being unreachable (it throws) — the first is a
  // real 404 page, the second is "try again," and conflating them would
  // 404 a thread that actually exists just because the backend hiccuped.
  let thread: Awaited<ReturnType<typeof getThread>>;
  let fetchFailed = false;
  try {
    thread = await getThread(threadId);
  } catch {
    thread = null;
    fetchFailed = true;
  }
  const posts = fetchFailed ? [] : await listPosts(threadId).catch(() => []);
  const viewer = await getViewerIdentity();

  if (fetchFailed) {
    return (
      <DiscussChrome
        crumbs={[{ label: "Discuss", href: "/discuss" }, { label: cat.name, href: `/discuss/${category}` }]}
        viewEvent="discuss_thread_view"
      >
        <section className="relative mx-auto max-w-3xl px-5 py-10">
          <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.03] p-6 text-center">
            <AlertTriangle className="h-5 w-5 text-rose-400" />
            <p className="max-w-sm font-mono text-[11px] text-rose-300">
              Couldn&apos;t load this thread right now — try refreshing.
            </p>
          </div>
        </section>
      </DiscussChrome>
    );
  }
  if (!thread || thread.category !== category) notFound();

  const isArticle = thread.postType === "article";
  const isFeed = thread.postType === "feed";
  const hasOpener = isArticle || isFeed;
  const articlePost = hasOpener ? posts[0] : null;
  const comments = hasOpener ? posts.slice(1) : posts;
  const wordCount = articlePost ? articlePost.body.trim().split(/\s+/).filter(Boolean).length : 0;
  const readMins = Math.max(1, Math.round(wordCount / 200));

  return (
    <DiscussChrome
      crumbs={[
        { label: "Discuss", href: "/discuss" },
        { label: cat.name, href: `/discuss/${category}` },
        { label: thread.title },
      ]}
      viewEvent="discuss_thread_view"
    >
      <section className="relative mx-auto max-w-3xl px-5 pb-4 pt-2">
        {isArticle ? (
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-quantum">
            Article · {readMins} min read
          </p>
        ) : isFeed ? (
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-amber-400">
            News · via {thread.sourceName ?? thread.authorName}
          </p>
        ) : null}
        <h1
          className={
            hasOpener
              ? "text-balance text-3xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-4xl"
              : "text-balance text-2xl font-bold tracking-tight text-zinc-50"
          }
        >
          {thread.title}
        </h1>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-600">
            {isArticle ? "By" : isFeed ? "Via" : "Started by"} {thread.authorName} · {timeAgo(thread.createdAt)}
          </p>
          <ShareButtons url={`${SITE_URL}/discuss/${category}/${thread.id}`} title={thread.title} />
        </div>
      </section>

      {articlePost ? (
        <section
          className={`relative mx-auto max-w-3xl border-l-2 px-5 pb-8 pl-6 ${
            isFeed ? "border-amber-400/30" : "border-quantum/30"
          }`}
        >
          <PostView
            threadId={thread.id}
            postId={articlePost.id}
            body={articlePost.body}
            deletedAt={articlePost.deletedAt}
            authorUid={articlePost.authorUid}
            viewerUid={viewer?.uid ?? null}
            likeCount={articlePost.likeCount}
            canLike={Boolean(viewer)}
            canReport={Boolean(viewer)}
            variant={isArticle ? "article" : "comment"}
          />
        </section>
      ) : null}

      <section className="relative mx-auto max-w-3xl px-5 pb-6">
        {comments.length ? (
          <p className="mb-3 font-mono text-[10.5px] uppercase tracking-wider text-zinc-600">
            {comments.length} {comments.length === 1 ? (hasOpener ? "comment" : "reply") : hasOpener ? "comments" : "replies"}
          </p>
        ) : null}
        <div className="relative">
          {comments.length > 1 ? (
            <div
              aria-hidden
              className="absolute bottom-[34px] left-[17px] top-[34px] w-px bg-gradient-to-b from-quantum/30 via-zinc-700/50 to-transparent"
            />
          ) : null}
          <div className="flex flex-col">
            {comments.map((p) => {
              const accent = avatarAccent(p.authorName);
              return (
                <article key={p.id} className="relative flex gap-3.5 py-3.5">
                  <span
                    className={`relative z-10 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border font-mono text-[12px] font-semibold ${accent.border} ${accent.bg} ${accent.text}`}
                  >
                    {p.authorName.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1 pt-0.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] font-semibold text-zinc-200">{p.authorName}</span>
                      <span className="shrink-0 font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
                        {timeAgo(p.createdAt)}
                        {p.editedAt ? " · edited" : ""}
                      </span>
                    </div>
                    <div className="mt-1">
                      <PostView
                        threadId={thread.id}
                        postId={p.id}
                        body={p.body}
                        deletedAt={p.deletedAt}
                        authorUid={p.authorUid}
                        viewerUid={viewer?.uid ?? null}
                        likeCount={p.likeCount}
                        canLike={Boolean(viewer)}
                        canReport={Boolean(viewer)}
                        variant="comment"
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-3xl px-5 pb-16">
        {thread.locked ? (
          <p className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-600">
            This thread is locked — no new replies.
          </p>
        ) : viewer ? (
          <ReplyForm threadId={thread.id} />
        ) : (
          <p className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-600">
            Sign in (top right) to reply
          </p>
        )}
      </section>
    </DiscussChrome>
  );
}
