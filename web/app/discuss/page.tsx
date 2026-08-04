import { MessageSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DiscussChrome } from "@/components/discuss/DiscussChrome";
import { FORUM_CATEGORIES } from "@/lib/content/forumCategories";

export const metadata: Metadata = {
  title: "Discuss — Community Forum for Options Traders",
  description:
    "DeltaK's community forum — strategy, market talk, feedback and general discussion. Free to read, sign in only to post.",
  alternates: { canonical: "/discuss" },
  robots: { index: true, follow: true },
};

export default function DiscussHubPage() {
  return (
    <DiscussChrome crumbs={[{ label: "Discuss" }]} viewEvent="discuss_hub_view">
      <section className="relative mx-auto max-w-4xl px-5 pb-8 pt-4 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
          Free to read · Sign in to post
        </span>
        <h1 className="mt-4 text-balance text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
          The DeltaK community
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-balance text-[14px] leading-relaxed text-zinc-400">
          Strategy, market talk, feedback and everything else worth a thread — every thread here
          is a real trader&apos;s own words, not DeltaK&apos;s.
        </p>
      </section>

      <section className="relative mx-auto max-w-4xl px-5 pb-16">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FORUM_CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/discuss/${c.slug}`}
              className="dk-panel group flex flex-col gap-2 rounded-lg p-5 transition-colors hover:border-quantum/40"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-quantum/30 bg-quantum/10">
                  <MessageSquare className="h-4 w-4 text-quantum" />
                </span>
                <h2 className="text-[15px] font-semibold text-zinc-100">{c.name}</h2>
              </div>
              <p className="text-[12.5px] leading-relaxed text-zinc-500">{c.tagline}</p>
            </Link>
          ))}
        </div>
      </section>
    </DiscussChrome>
  );
}
