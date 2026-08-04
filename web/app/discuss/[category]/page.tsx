import { AlertTriangle, FileText, MessageCircle, Pin, Rss } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { DiscussChrome } from "@/components/discuss/DiscussChrome";
import { NewThreadForm } from "@/components/discuss/NewThreadForm";
import { getForumCategory } from "@/lib/content/forumCategories";
import { excerptFromMarkdown } from "@/lib/discuss/markdown";
import { getViewerIdentity } from "@/lib/server/firebaseAuth";
import { listPosts, listThreads } from "@/lib/server/forum";
import { timeAgo } from "@/lib/utils";

// Threads change on every post — server-rendered fresh on each request
// rather than statically generated, same reasoning the /tools family's
// live dashboards use `force-dynamic` for.
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category } = await params;
  const cat = getForumCategory(category);
  if (!cat) return {};
  return {
    title: `${cat.name} — Discuss`,
    description: cat.description,
    alternates: { canonical: `/discuss/${cat.slug}` },
    robots: { index: true, follow: true },
  };
}

export default async function DiscussCategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;
  const cat = getForumCategory(category);
  if (!cat) notFound();

  // Firestore is a wholly separate backend from everything else this app
  // reaches (see firestore.ts's own header comment) — an outage or a
  // misconfigured deployment there must not take the whole page down with
  // it the way an unhandled Server Component throw would.
  const [threadsResult, viewer] = await Promise.all([
    listThreads(category).then(
      (threads) => ({ ok: true as const, threads }),
      () => ({ ok: false as const, threads: [] as Awaited<ReturnType<typeof listThreads>> }),
    ),
    getViewerIdentity(),
  ]);
  const threads = threadsResult.threads;
  const pinned = threads.filter((t) => t.pinned);
  const rest = threads.filter((t) => !t.pinned);
  const ordered = [...pinned, ...rest];

  // Only articles get a preview excerpt — a fetch per article thread, not
  // per thread overall, since a category page rarely holds more than a
  // handful of long-form pieces at once.
  const articleIds = ordered.filter((t) => t.postType === "article").map((t) => t.id);
  const excerptEntries = await Promise.all(
    articleIds.map(async (id) => {
      const opener = await listPosts(id, 1).catch(() => []);
      return [id, opener[0] ? excerptFromMarkdown(opener[0].body, 170) : ""] as const;
    }),
  );
  const excerpts = new Map(excerptEntries);

  return (
    <DiscussChrome
      crumbs={[{ label: "Discuss", href: "/discuss" }, { label: cat.name }]}
      viewEvent="discuss_category_view"
    >
      <section className="relative mx-auto max-w-3xl px-5 pb-4 pt-2">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-50">{cat.name}</h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-zinc-500">{cat.description}</p>
      </section>

      <section className="relative mx-auto max-w-3xl px-5 pb-16">
        <div className="mb-3">
          {viewer ? (
            <NewThreadForm category={category} />
          ) : (
            <p className="font-mono text-[10.5px] uppercase tracking-wider text-zinc-600">
              Sign in (top right) to start a thread
            </p>
          )}
        </div>

        {!threadsResult.ok ? (
          <div className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/[0.03] p-6 text-center">
            <AlertTriangle className="h-5 w-5 text-rose-400" />
            <p className="max-w-sm font-mono text-[11px] text-rose-300">
              Couldn&apos;t load threads right now — try refreshing.
            </p>
          </div>
        ) : threads.length === 0 ? (
          <div className="dk-panel flex min-h-[120px] items-center justify-center rounded-lg p-6">
            <p className="font-mono text-[11px] text-zinc-600">
              Nothing here yet — be the first to start a thread.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {ordered.map((t) =>
              t.postType === "article" ? (
                <Link
                  key={t.id}
                  href={`/discuss/${category}/${t.id}`}
                  className="dk-panel group rounded-lg p-5 transition-colors hover:border-quantum/30 hover:bg-white/[0.02]"
                >
                  <div className="flex items-center gap-1.5">
                    {t.pinned ? <Pin className="h-3 w-3 shrink-0 text-quantum" /> : null}
                    <span className="flex items-center gap-1 rounded border border-quantum/40 bg-quantum/10 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-quantum">
                      <FileText className="h-2.5 w-2.5" />
                      Article
                    </span>
                    <span className="font-mono text-[10px] text-zinc-600">
                      {t.authorName} · {timeAgo(t.createdAt)}
                    </span>
                  </div>
                  <h2 className="mt-2 text-balance text-lg font-semibold leading-snug text-zinc-50 group-hover:text-quantum">
                    {t.title}
                  </h2>
                  {excerpts.get(t.id) ? (
                    <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed text-zinc-400">
                      {excerpts.get(t.id)}
                    </p>
                  ) : null}
                  <span className="mt-3 inline-block rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[9.5px] text-zinc-500">
                    {t.replyCount} {t.replyCount === 1 ? "reply" : "replies"}
                  </span>
                </Link>
              ) : (
                <Link
                  key={t.id}
                  href={`/discuss/${category}/${t.id}`}
                  className="dk-panel flex items-center gap-3 rounded-lg px-4 py-3.5 transition-colors hover:border-quantum/30 hover:bg-white/[0.02]"
                >
                  {t.postType === "feed" ? (
                    <Rss className="h-4 w-4 shrink-0 text-amber-400/70" />
                  ) : (
                    <MessageCircle className="h-4 w-4 shrink-0 text-zinc-600" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {t.pinned ? <Pin className="h-3 w-3 shrink-0 text-quantum" /> : null}
                      {t.postType === "feed" ? (
                        <span className="shrink-0 rounded border border-amber-400/40 bg-amber-400/10 px-1.5 py-0.5 font-mono text-[8.5px] uppercase tracking-wider text-amber-400">
                          News
                        </span>
                      ) : null}
                      <span className="truncate text-[13.5px] font-medium text-zinc-100">
                        {t.title}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-600">
                      {t.postType === "feed" ? `via ${t.authorName}` : t.authorName} · {timeAgo(t.createdAt)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[9.5px] text-zinc-500">
                    {t.replyCount} {t.replyCount === 1 ? "reply" : "replies"}
                  </span>
                </Link>
              ),
            )}
          </div>
        )}
      </section>
    </DiscussChrome>
  );
}
