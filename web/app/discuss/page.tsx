import { Users } from "lucide-react";
import type { Metadata } from "next";

import { CardLink } from "@/components/discuss/CardLink";
import { DiscussChrome } from "@/components/discuss/DiscussChrome";
import { FORUM_CATEGORIES } from "@/lib/content/forumCategories";
import { ACCENT_CLASSES, CATEGORY_ICON } from "@/lib/content/forumCategoryStyle";

export const metadata: Metadata = {
  title: "Quantum Horizon — Community Forum for Options Traders",
  description:
    "Quantum Horizon (qntmhrzn) — DeltaK's community forum. Strategy, market talk, feedback and general discussion. Free to read, sign in only to post.",
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
          Quantum Horizon
        </h1>
        <p className="mt-1.5 font-mono text-[11px] tracking-[0.14em] text-zinc-600">qntmhrzn</p>
        <p className="mx-auto mt-4 max-w-2xl text-balance text-[14px] leading-relaxed text-zinc-400">
          DeltaK&apos;s community — strategy, market talk, feedback and everything else worth a
          thread. Every thread here is a real trader&apos;s own words, not DeltaK&apos;s.
        </p>
      </section>

      <section className="relative mx-auto max-w-4xl px-5 pb-16">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FORUM_CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c.slug as keyof typeof CATEGORY_ICON] ?? Users;
            const accent = ACCENT_CLASSES[c.accent];
            return (
              <CardLink
                key={c.slug}
                href={`/discuss/${c.slug}`}
                className={`dk-panel group relative flex flex-col gap-2 overflow-hidden rounded-lg p-5 transition-colors ${accent.hoverBorder}`}
              >
                <div
                  aria-hidden
                  className={`pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full ${accent.bg} opacity-60 blur-[50px] transition-opacity group-hover:opacity-100`}
                />
                <div className="relative flex items-center gap-2.5">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${accent.border} ${accent.bg}`}
                  >
                    <Icon className={`h-4 w-4 ${accent.text}`} />
                  </span>
                  <h2 className="text-[15px] font-semibold text-zinc-100">{c.name}</h2>
                </div>
                <p className="relative text-[12.5px] leading-relaxed text-zinc-500">{c.tagline}</p>
              </CardLink>
            );
          })}
        </div>
      </section>
    </DiscussChrome>
  );
}
