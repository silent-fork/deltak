import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleBody } from "@/components/discuss/ArticleBody";
import { DiscussChrome } from "@/components/discuss/DiscussChrome";
import { ReplyForm } from "@/components/discuss/ReplyForm";
import { ReportButton } from "@/components/discuss/ReportButton";
import { getForumCategory } from "@/lib/content/forumCategories";
import { renderForumMarkdown } from "@/lib/discuss/markdown";
import { getViewerIdentity } from "@/lib/server/firebaseAuth";
import { getThread, listPosts } from "@/lib/server/forum";
import { timeAgo } from "@/lib/utils";

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
  const articlePost = isArticle ? posts[0] : null;
  const comments = isArticle ? posts.slice(1) : posts;
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
        ) : null}
        <h1
          className={
            isArticle
              ? "text-balance text-3xl font-bold leading-tight tracking-tight text-zinc-50 sm:text-4xl"
              : "text-balance text-2xl font-bold tracking-tight text-zinc-50"
          }
        >
          {thread.title}
        </h1>
        <p className="mt-1.5 font-mono text-[10.5px] uppercase tracking-wider text-zinc-600">
          {isArticle ? "By" : "Started by"} {thread.authorName} · {timeAgo(thread.createdAt)}
        </p>
      </section>

      {articlePost ? (
        <section className="relative mx-auto max-w-3xl border-l-2 border-quantum/30 px-5 pb-8 pl-6">
          <div className="text-[15px] leading-[1.85] text-zinc-300">
            <ArticleBody body={articlePost.deletedAt ? "[removed by moderator]" : articlePost.body} />
          </div>
          {!articlePost.deletedAt ? (
            <div className="mt-4 flex justify-end">
              <ReportButton threadId={thread.id} postId={articlePost.id} canReport={Boolean(viewer)} />
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="relative mx-auto max-w-3xl px-5 pb-6">
        {isArticle && comments.length ? (
          <p className="mb-3 font-mono text-[10.5px] uppercase tracking-wider text-zinc-600">
            {comments.length} {comments.length === 1 ? "comment" : "comments"}
          </p>
        ) : null}
        <div className="flex flex-col gap-3">
          {comments.map((p) => (
            <article key={p.id} className="dk-panel rounded-lg p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-semibold text-zinc-200">{p.authorName}</span>
                <span className="font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
                  {timeAgo(p.createdAt)}
                  {p.editedAt ? " · edited" : ""}
                </span>
              </div>
              <div className="mt-2 text-[13.5px] leading-relaxed text-zinc-300">
                {renderForumMarkdown(p.deletedAt ? "[removed by moderator]" : p.body)}
              </div>
              {!p.deletedAt ? (
                <div className="mt-2 flex justify-end">
                  <ReportButton threadId={thread.id} postId={p.id} canReport={Boolean(viewer)} />
                </div>
              ) : null}
            </article>
          ))}
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
