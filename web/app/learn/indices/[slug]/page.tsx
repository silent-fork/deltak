import { CheckCircle2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LearnChrome } from "@/components/LearnChrome";
import { getIndex, INDICES } from "@/lib/content/indices";

export const dynamic = "error";
export const dynamicParams = false;

export function generateStaticParams() {
  return INDICES.map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const idx = getIndex(slug);
  if (!idx) return {};
  return {
    title: `${idx.name} Options — Lot Size, Strike Step & Contract Details`,
    description: idx.description,
    keywords: idx.keywords,
    alternates: { canonical: `/learn/indices/${idx.slug}` },
  };
}

export default async function IndexPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const idx = getIndex(slug);
  if (!idx) notFound();

  const others = INDICES.filter((i) => i.slug !== idx.slug);

  return (
    <LearnChrome
      ctaLocation={`learn-index-${idx.slug}`}
      crumbs={[
        { label: "Learn", href: "/learn" },
        { label: "Indices", href: "/learn/indices" },
        { label: idx.name },
      ]}
    >
      <section className="relative mx-auto max-w-3xl px-5 pb-6 pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 whitespace-nowrap rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
            {idx.exchange}
          </span>
          {idx.tradedByDeltaK ? (
            <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-quantum/40 bg-quantum/10 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider text-quantum">
              <CheckCircle2 className="h-3 w-3 shrink-0" />
              Traded by DeltaK
            </span>
          ) : (
            <span className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-zinc-700 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
              <XCircle className="h-3 w-3 shrink-0" />
              Not traded by DeltaK
            </span>
          )}
        </div>
        <h1 className="mt-3 text-balance text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">{idx.name}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-balance text-[13.5px] leading-relaxed text-zinc-400">
          {idx.description}
        </p>
      </section>

      <section className="relative mx-auto max-w-3xl px-5 pb-8">
        <div className="grid grid-cols-2 gap-3">
          <div className="dk-panel rounded-lg p-4 text-center">
            <p className="dk-label">Lot Size</p>
            <p className="mt-1 font-mono text-lg font-semibold text-zinc-100">{idx.lotSize ?? "—"}</p>
          </div>
          <div className="dk-panel rounded-lg p-4 text-center">
            <p className="dk-label">Strike Step</p>
            <p className="mt-1 font-mono text-lg font-semibold text-zinc-100">{idx.strikeStep ?? "—"}</p>
          </div>
        </div>
        <p className="mt-3 text-[11.5px] leading-relaxed text-zinc-600">{idx.specNote}</p>
      </section>

      <section className="relative mx-auto max-w-3xl px-5 pb-10">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Other Indian F&amp;O indices</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {others.map((o) => (
            <Link
              key={o.slug}
              href={`/learn/indices/${o.slug}`}
              className="dk-panel rounded-lg p-3 text-[12.5px] font-semibold text-zinc-200 transition-colors hover:border-zinc-700"
            >
              {o.name}
            </Link>
          ))}
        </div>
      </section>
    </LearnChrome>
  );
}
