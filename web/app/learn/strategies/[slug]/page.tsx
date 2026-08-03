import { ArrowRight, Ban, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ComplexityBadge, LearnChrome } from "@/components/LearnChrome";
import { legStrikeLabel, PayoffChart } from "@/components/PayoffChart";
import { computePayoff, tradeIdeaNarrative } from "@/lib/content/payoff";
import { getStrategy, STRATEGIES, STRATEGY_EXAMPLE } from "@/lib/content/strategies";

export const dynamic = "error";
export const dynamicParams = false;

export function generateStaticParams() {
  return STRATEGIES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const strategy = getStrategy(slug);
  if (!strategy) return {};
  const title = `${strategy.name} Options Strategy: Setup, Payoff Diagram & Rules`;
  const description = `${strategy.summary} How to build it, when to deploy it, and the mistakes that break it — with a live payoff diagram against an illustrative ${STRATEGY_EXAMPLE.underlying} example.`;
  return {
    title,
    description,
    keywords: strategy.keywords,
    alternates: { canonical: `/learn/strategies/${strategy.slug}` },
  };
}

const fmt = (n: number) => `₹${Math.round(Math.abs(n)).toLocaleString("en-IN")}`;

export default async function StrategyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const strategy = getStrategy(slug);
  if (!strategy) notFound();

  const summary = computePayoff(strategy.legs, STRATEGY_EXAMPLE);
  const tradeIdea = tradeIdeaNarrative(strategy.legs, STRATEGY_EXAMPLE);
  const others = STRATEGIES.filter((s) => s.slug !== strategy.slug && s.category === strategy.category).slice(0, 3);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: `${strategy.name} Options Strategy`,
    description: strategy.summary,
    author: { "@type": "Organization", name: "DeltaK" },
  };

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <LearnChrome
        ctaLocation={`learn-strategy-${strategy.slug}`}
        viewEvent="learn_strategy_view"
        viewData={{ slug: strategy.slug, category: strategy.category, complexity: strategy.complexity }}
        crumbs={[
          { label: "Learn", href: "/learn" },
          { label: "Strategies", href: "/learn/strategies" },
          { label: strategy.name },
        ]}
      >
        <section className="relative mx-auto max-w-4xl px-5 pb-6 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <ComplexityBadge level={strategy.complexity} />
            <span className="shrink-0 whitespace-nowrap rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
              {strategy.category}
            </span>
            <span className="shrink-0 whitespace-nowrap rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
              {strategy.legs.length}-leg
            </span>
          </div>
          <h1 className="mt-3 text-balance text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
            {strategy.name}
          </h1>
          <p className="mt-1 text-[13px] font-semibold uppercase tracking-wide text-quantum">{strategy.outlook}</p>
          <p className="mt-3 max-w-2xl text-balance text-[13.5px] leading-relaxed text-zinc-400">
            {strategy.summary}
          </p>
        </section>

        <section className="relative mx-auto max-w-4xl px-5 pb-8">
          <div className="dk-panel rounded-lg p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-[13px] font-semibold text-zinc-100">Payoff at expiry</h2>
              <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                Illustrative · {STRATEGY_EXAMPLE.underlying} @ {STRATEGY_EXAMPLE.spot}
              </span>
            </div>
            <div className="mt-3">
              <PayoffChart legs={strategy.legs} example={STRATEGY_EXAMPLE} id={strategy.slug} />
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {strategy.legs.map((leg, i) => (
                <span
                  key={i}
                  className={`shrink-0 whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                    leg.action === "buy"
                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                      : "border-rose-500/30 bg-rose-500/10 text-rose-400"
                  }`}
                >
                  {legStrikeLabel(leg, STRATEGY_EXAMPLE)}
                </span>
              ))}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="dk-panel rounded-lg p-3 text-center">
              <p className="dk-label">Max Profit</p>
              <p className="mt-1 font-mono text-[13px] font-semibold text-emerald-400">
                {summary.unlimitedProfit ? "Unlimited" : fmt(summary.maxProfit)}
              </p>
            </div>
            <div className="dk-panel rounded-lg p-3 text-center">
              <p className="dk-label">Max Loss</p>
              <p className="mt-1 font-mono text-[13px] font-semibold text-rose-400">
                {summary.unlimitedLoss ? "Unlimited" : fmt(summary.maxLoss)}
              </p>
            </div>
            <div className="dk-panel rounded-lg p-3 text-center">
              <p className="dk-label">Breakeven</p>
              <p className="mt-1 font-mono text-[13px] font-semibold text-zinc-100">
                {summary.breakevens.length ? summary.breakevens.join(" / ") : "—"}
              </p>
            </div>
          </div>
        </section>

        <section className="relative mx-auto max-w-4xl px-5 pb-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="dk-panel rounded-lg p-4">
              <h2 className="text-[13px] font-semibold text-zinc-100">How it&apos;s built</h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-400">{strategy.construction}</p>
            </div>
            <div className="dk-panel rounded-lg p-4">
              <h2 className="text-[13px] font-semibold text-zinc-100">When to deploy it</h2>
              <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-400">{strategy.idealScenario}</p>
            </div>
          </div>
        </section>

        <section className="relative mx-auto max-w-4xl px-5 pb-8">
          <div className="dk-panel rounded-lg p-4">
            <h2 className="text-[13px] font-semibold text-zinc-100">Worked example</h2>
            <div className="mt-2 space-y-2.5">
              {tradeIdea.map((para, i) => (
                <p key={i} className="text-[12.5px] leading-relaxed text-zinc-400">
                  {para}
                </p>
              ))}
            </div>
          </div>
        </section>

        <section className="relative mx-auto max-w-4xl px-5 pb-10">
          <div className="dk-panel rounded-lg p-4">
            <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-100">
              <Ban className="h-3.5 w-3.5 text-rose-400" />
              Mistakes that break this strategy
            </h2>
            <ul className="mt-3 space-y-2">
              {strategy.mistakes.map((m, i) => (
                <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-zinc-400">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-600" />
                  {m}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {others.length > 0 && (
          <section className="relative mx-auto max-w-4xl px-5 pb-10">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
              More {strategy.category.toLowerCase()} strategies
            </h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {others.map((o) => (
                <Link
                  key={o.slug}
                  href={`/learn/strategies/${o.slug}`}
                  className="dk-panel flex items-center justify-between gap-2 rounded-lg p-3 transition-colors hover:border-zinc-700"
                >
                  <span className="text-[12.5px] font-semibold text-zinc-200">{o.name}</span>
                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-zinc-600" />
                </Link>
              ))}
            </div>
          </section>
        )}
      </LearnChrome>
    </>
  );
}
