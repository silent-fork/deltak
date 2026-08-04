import { ArrowRight, Clock3 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LearnChrome } from "@/components/LearnChrome";
import { TimeHorizonBar } from "@/components/TimeHorizonBar";
import { TRADING_STYLES } from "@/lib/content/tradingStyles";

export const metadata: Metadata = {
  title: "Options Styles — Intraday, Swing & Positional",
  description:
    "Intraday, swing and positional options trading compared — time horizon, " +
    "risk profile, and options buying vs. selling.",
  keywords: [
    "options trading styles india",
    "intraday vs swing vs positional trading",
    "options buying vs selling",
  ],
  alternates: { canonical: "/learn/trading-styles" },
};

export default function TradingStylesHubPage() {
  return (
    <LearnChrome
      ctaLocation="learn-styles-hub"
      viewEvent="learn_trading_styles_hub_view"
      crumbs={[{ label: "Learn", href: "/learn" }, { label: "Trading Styles" }]}
    >
      <section className="relative mx-auto max-w-4xl px-5 pb-8 pt-4 text-center">
        <h1 className="text-balance text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
          Options trading styles
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-balance text-[13.5px] leading-relaxed text-zinc-400">
          The same strategy can be run intraday, swung across a week, or held positionally through a whole
          expiry cycle — the style is a separate decision from which legs to put on.
        </p>
      </section>

      <section className="relative mx-auto max-w-6xl px-5 pb-12">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TRADING_STYLES.map((s) => (
            <Link
              key={s.slug}
              href={`/learn/trading-styles/${s.slug}`}
              className="dk-panel group flex flex-col rounded-lg p-4 transition-colors hover:border-zinc-700"
            >
              <span className="inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500">
                <Clock3 className="h-3 w-3 shrink-0" />
                {s.durationLabel}
              </span>
              <div className="mt-3">
                <TimeHorizonBar activeSlug={s.slug} />
              </div>
              <h2 className="mt-3 text-[14px] font-semibold text-zinc-100">{s.name}</h2>
              <p className="mt-1.5 flex-1 text-[12px] leading-relaxed text-zinc-500">{s.summary}</p>
              <span className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-zinc-500 transition-colors group-hover:text-quantum">
                Read more
                <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </LearnChrome>
  );
}
