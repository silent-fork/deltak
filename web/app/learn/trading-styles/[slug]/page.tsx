import { AlertTriangle, Clock3 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { BuySellBalance } from "@/components/BuySellBalance";
import { LearnChrome } from "@/components/LearnChrome";
import { TimeHorizonBar } from "@/components/TimeHorizonBar";
import { getTradingStyle, TRADING_STYLES } from "@/lib/content/tradingStyles";

export const dynamic = "error";
export const dynamicParams = false;

export function generateStaticParams() {
  return TRADING_STYLES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const style = getTradingStyle(slug);
  if (!style) return {};
  // "Options Buying vs. Options Selling" (34 chars) is the longest style
  // name — `— How It Works` keeps every combination under 70 with the
  // root layout's " · DeltaK Terminal" template suffix appended.
  return {
    title: `${style.name} — How It Works`,
    description: style.summary,
    keywords: style.keywords,
    alternates: { canonical: `/learn/trading-styles/${style.slug}` },
  };
}

export default async function TradingStylePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const style = getTradingStyle(slug);
  if (!style) notFound();

  const others = TRADING_STYLES.filter((s) => s.slug !== style.slug);

  return (
    <LearnChrome
      ctaLocation={`learn-style-${style.slug}`}
      viewEvent="learn_trading_style_view"
      viewData={{ slug: style.slug }}
      crumbs={[
        { label: "Learn", href: "/learn" },
        { label: "Trading Styles", href: "/learn/trading-styles" },
        { label: style.name },
      ]}
    >
      <section className="relative mx-auto max-w-4xl px-5 pb-6 pt-4">
        <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
          <Clock3 className="h-3 w-3 shrink-0" />
          {style.durationLabel}
        </span>
        <h1 className="mt-4 text-balance text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">{style.name}</h1>
        <p className="mt-3 max-w-2xl text-balance text-[13.5px] leading-relaxed text-zinc-400">
          {style.summary}
        </p>
        <div className="mt-5 max-w-sm">
          <TimeHorizonBar activeSlug={style.slug} />
        </div>
        <p className="mt-2 max-w-2xl text-balance text-[11.5px] leading-relaxed text-zinc-600">
          {style.horizon}
        </p>
        {style.slug === "options-buying-vs-selling" && (
          <div className="mt-6 max-w-md">
            <BuySellBalance />
          </div>
        )}
      </section>

      <section className="relative mx-auto max-w-4xl px-5 pb-8">
        <div className="dk-panel space-y-3 rounded-lg p-5">
          <h2 className="text-[13px] font-semibold text-zinc-100">How it works</h2>
          {style.howItWorks.map((p, i) => (
            <p key={i} className="text-[12.5px] leading-relaxed text-zinc-400">
              {p}
            </p>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-4xl px-5 pb-8">
        <div className="dk-panel space-y-3 rounded-lg p-5">
          <h2 className="text-[13px] font-semibold text-zinc-100">Worked example</h2>
          {style.exampleTrade.map((p, i) => (
            <p key={i} className="text-[12.5px] leading-relaxed text-zinc-400">
              {p}
            </p>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-4xl px-5 pb-8">
        <div className="dk-panel rounded-lg p-5">
          <h2 className="text-[13px] font-semibold text-zinc-100">Who it suits</h2>
          <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-400">{style.suitedFor}</p>
        </div>
      </section>

      <section className="relative mx-auto max-w-4xl px-5 pb-10">
        <div className="dk-panel rounded-lg p-5">
          <h2 className="flex items-center gap-1.5 text-[13px] font-semibold text-zinc-100">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
            Key risks
          </h2>
          <ul className="mt-3 space-y-2">
            {style.risks.map((r, i) => (
              <li key={i} className="text-[12.5px] leading-relaxed text-zinc-400">
                · {r}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="relative mx-auto max-w-4xl px-5 pb-10">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Other trading styles</h2>
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          {others.map((o) => (
            <Link
              key={o.slug}
              href={`/learn/trading-styles/${o.slug}`}
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
