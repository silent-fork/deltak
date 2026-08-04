import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BreakevenLine } from "@/components/BreakevenLine";
import { GreekGauge } from "@/components/GreekGauge";
import { LearnChrome } from "@/components/LearnChrome";
import { MarginStack } from "@/components/MarginStack";
import { MaxPainCurve } from "@/components/MaxPainCurve";
import { MoneynessStrip } from "@/components/MoneynessStrip";
import { OiBuildupMatrix } from "@/components/OiBuildupMatrix";
import { PcrGauge } from "@/components/PcrGauge";
import { ThetaCurve } from "@/components/ThetaCurve";
import { getGlossaryTerm, GLOSSARY } from "@/lib/content/glossary";

const SITE_URL =
  process.env.NEXT_PUBLIC_DK_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

const MONEYNESS_TERMS: Record<string, "itm" | "atm" | "otm" | "moneyness"> = {
  "at-the-money-atm": "atm",
  "in-the-money-itm": "itm",
  "out-of-the-money-otm": "otm",
  moneyness: "moneyness",
  "quantum-horizon": "atm",
};

export const dynamic = "error";
export const dynamicParams = false;

export function generateStaticParams() {
  return GLOSSARY.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const entry = getGlossaryTerm(slug);
  if (!entry) return {};
  // `${entry.term} — F&O` keeps the longest real term (43 chars — "Securities
  // Transaction Tax (STT) on Options") under 70 once " · DeltaK Terminal" is
  // appended by the root layout's title template.
  return {
    title: `${entry.term} — F&O`,
    description: entry.shortDef,
    keywords: entry.keywords,
    alternates: { canonical: `/learn/glossary/${entry.slug}` },
  };
}

export default async function GlossaryTermPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const entry = getGlossaryTerm(slug);
  if (!entry) notFound();

  const related = entry.related.map((slug) => GLOSSARY.find((g) => g.slug === slug)).filter((g): g is NonNullable<typeof g> => !!g);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTerm",
    name: entry.term,
    description: entry.shortDef,
    inDefinedTermSet: `${SITE_URL}/learn/glossary`,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LearnChrome
        ctaLocation={`learn-glossary-${entry.slug}`}
        viewEvent="learn_glossary_view"
        viewData={{ slug: entry.slug, category: entry.category }}
        crumbs={[
          { label: "Learn", href: "/learn" },
          { label: "Glossary", href: "/learn/glossary" },
          { label: entry.term },
        ]}
      >
        <section className="relative mx-auto max-w-4xl px-5 pb-6 pt-4">
          <span className="inline-block shrink-0 whitespace-nowrap rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
            {entry.category}
          </span>
          <h1 className="mt-3 text-balance text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
            {entry.term}
          </h1>
          <p className="mt-3 max-w-2xl text-balance text-[14px] leading-relaxed text-zinc-300">
            {entry.shortDef}
          </p>
        </section>

        <section className="relative mx-auto max-w-4xl px-5 pb-8">
          <div className="dk-panel space-y-3 rounded-lg p-5">
            {entry.body.map((para, i) => (
              <p key={i} className="text-[13px] leading-relaxed text-zinc-400">
                {para}
              </p>
            ))}
          </div>
          {entry.slug === "oi-buildup-matrix" && (
            <div className="mt-4">
              <OiBuildupMatrix />
            </div>
          )}
          {entry.slug in MONEYNESS_TERMS && (
            <div className="mt-4">
              <MoneynessStrip emphasis={MONEYNESS_TERMS[entry.slug]} />
            </div>
          )}
          {entry.slug === "theta" && (
            <div className="dk-panel mt-4 rounded-lg p-4">
              <ThetaCurve />
            </div>
          )}
          {(entry.slug === "delta-greek" || entry.slug === "gamma-greek" || entry.slug === "vega" || entry.slug === "implied-volatility-iv") && (
            <div className="dk-panel mt-4 rounded-lg p-4">
              <GreekGauge
                kind={
                  entry.slug === "delta-greek"
                    ? "delta"
                    : entry.slug === "gamma-greek"
                      ? "gamma"
                      : entry.slug === "vega"
                        ? "vega"
                        : "iv"
                }
              />
            </div>
          )}
          {(entry.slug === "span-margin" || entry.slug === "exposure-margin") && (
            <div className="dk-panel mt-4 rounded-lg p-4">
              <MarginStack />
            </div>
          )}
          {entry.slug === "max-pain" && (
            <div className="dk-panel mt-4 rounded-lg p-4">
              <MaxPainCurve />
            </div>
          )}
          {entry.slug === "put-call-ratio-pcr" && (
            <div className="dk-panel mt-4 rounded-lg p-4">
              <PcrGauge />
            </div>
          )}
          {entry.slug === "breakeven-point" && (
            <div className="dk-panel mt-4 rounded-lg p-4">
              <BreakevenLine />
            </div>
          )}
        </section>

        {related.length > 0 && (
          <section className="relative mx-auto max-w-4xl px-5 pb-10">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Related terms</h2>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/learn/glossary/${r.slug}`}
                  className="dk-panel group flex items-center justify-between gap-2 rounded-lg p-3 transition-colors hover:border-zinc-700"
                >
                  <span className="text-[12.5px] font-semibold text-zinc-200">{r.term}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-600 transition-colors group-hover:text-quantum" />
                </Link>
              ))}
            </div>
          </section>
        )}
      </LearnChrome>
    </>
  );
}
