import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ComplexityBadge, LearnChrome } from "@/components/LearnChrome";
import { PayoffChart } from "@/components/PayoffChart";
import { STRATEGIES, STRATEGY_EXAMPLE, type StrategyCategory } from "@/lib/content/strategies";

export const metadata: Metadata = {
  title: "Options Trading Strategies — Payoff Diagrams & Rules for Indian F&O",
  description:
    "Twelve options strategies from a plain long call through iron condors, iron butterflies and the jade lizard — each with a payoff diagram, construction, ideal scenario and the mistakes that break it.",
  keywords: [
    "options trading strategies india",
    "advanced options strategies",
    "iron condor nifty",
    "options strategy payoff diagram",
  ],
  alternates: { canonical: "/learn/strategies" },
};

const CATEGORIES: StrategyCategory[] = ["Bullish", "Bearish", "Volatility", "Neutral"];

export default function StrategiesHubPage() {
  return (
    <LearnChrome
      ctaLocation="learn-strategies-hub"
      viewEvent="learn_strategies_hub_view"
      crumbs={[{ label: "Learn", href: "/learn" }, { label: "Strategies" }]}
    >
      <section className="relative mx-auto max-w-4xl px-5 pb-8 pt-4 text-center">
        <h1 className="text-balance text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
          Options trading strategies, from a single leg to defined-risk advanced structures
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-balance text-[13.5px] leading-relaxed text-zinc-400">
          Every strategy below is drawn against the same illustrative {STRATEGY_EXAMPLE.underlying} example
          so the numbers stay comparable — a long call, a bull call spread and an iron condor priced off the
          same premium table, the same strike step, the same Quantum Horizon at the money.
        </p>
      </section>

      {CATEGORIES.map((category) => {
        const items = STRATEGIES.filter((s) => s.category === category);
        return (
          <section key={category} className="relative mx-auto max-w-6xl px-5 pb-10">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{category}</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((s) => (
                <Link
                  key={s.slug}
                  href={`/learn/strategies/${s.slug}`}
                  className="dk-panel group flex flex-col rounded-lg p-4 transition-colors hover:border-zinc-700"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-[13px] font-semibold text-zinc-100">{s.name}</h3>
                    <ComplexityBadge level={s.complexity} />
                  </div>
                  <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-quantum">{s.outlook}</p>
                  <div className="mt-2">
                    <PayoffChart legs={s.legs} example={STRATEGY_EXAMPLE} compact id={`hub-${s.slug}`} />
                  </div>
                  <p className="mt-2 flex-1 text-[12px] leading-relaxed text-zinc-500">{s.summary}</p>
                  <span className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-zinc-500 transition-colors group-hover:text-quantum">
                    Read the setup
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </LearnChrome>
  );
}
