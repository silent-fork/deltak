import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { DiscussChrome } from "@/components/discuss/DiscussChrome";
import { ReplyForm } from "@/components/discuss/ReplyForm";
import { ReportButton } from "@/components/discuss/ReportButton";
import { getForumCategory } from "@/lib/content/forumCategories";
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
        <h1 className="text-balance text-2xl font-bold tracking-tight text-zinc-50">
          {thread.title}
        </h1>
        <p className="mt-1.5 font-mono text-[10.5px] uppercase tracking-wider text-zinc-600">
          Started by {thread.authorName} · {timeAgo(thread.createdAt)}
        </p>
      </section>

      <section className="relative mx-auto max-w-3xl px-5 pb-6">
        <div className="flex flex-col gap-3">
          {posts.map((p) => (
            <article key={p.id} className="dk-panel rounded-lg p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px] font-semibold text-zinc-200">{p.authorName}</span>
                <span className="font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
                  {timeAgo(p.createdAt)}
                  {p.editedAt ? " · edited" : ""}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-zinc-300">
                {p.deletedAt ? "[removed by moderator]" : p.body}
              </p>
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
