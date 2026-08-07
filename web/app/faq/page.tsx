import type { Metadata } from "next";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { LearnChrome } from "@/components/LearnChrome";
import { FaqAccordion } from "@/components/FaqAccordion";
import { FAQS } from "@/lib/content/faq";

export const metadata: Metadata = {
  title: "FAQ — DeltaK Matrix Strategy, Paper Trading & More",
  description:
    "Answers on DKMS — the wall-and-rotation strategy, limit entry and thesis " +
    "tracking, position sizing, supported brokers, and the mobile companion.",
  keywords: [
    "deltak faq",
    "dkms strategy explained",
    "aegis zenith wall",
    "thesis exit options",
  ],
  alternates: { canonical: "/faq" },
};

/**
 * Google renders this as an expandable Q&A directly in search results —
 * the accordion below is a straight serialization of the same `FAQS` array
 * that drives it, not a second, separately-maintained copy of the content.
 */
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((f) => ({
    "@type": "Question",
    name: f.question,
    acceptedAnswer: {
      "@type": "Answer",
      text: f.answer.join(" "),
    },
  })),
};

export default function FaqPage() {
  return (
    <LearnChrome
      ctaLocation="faq"
      viewEvent="faq_view"
      crumbs={[{ label: "FAQ" }]}
    >
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <section className="relative mx-auto max-w-4xl px-5 pb-6 pt-4 text-center">
        <p className="dk-label text-[10.5px] text-quantum">Frequently asked questions</p>
        <h1 className="mt-1.5 text-balance text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
          Quantum Horizon, decoded
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-balance text-[13.5px] leading-relaxed text-zinc-400">
          Every wall, rotation and thesis check DKMS runs, spelled out in plain
          English — no chain-reading required. Search or filter by topic below.
        </p>
      </section>

      <section className="relative mx-auto max-w-3xl px-5 pb-8">
        <FaqAccordion items={FAQS} />
      </section>

      <section className="relative mx-auto max-w-3xl px-5 pb-12">
        <Link
          href="/learn/backtest"
          className="dk-panel group flex items-center justify-between gap-3 rounded-lg p-4 transition-colors hover:border-quantum/40"
        >
          <div>
            <p className="text-[12.5px] font-semibold text-zinc-100">Want the numbers behind those answers?</p>
            <p className="mt-1 text-[11.5px] text-zinc-500">
              Sharpe, drawdown, attribution and a worked trade from the full 18-month walk-forward backtest.
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1 font-mono text-[10.5px] font-semibold uppercase tracking-wider text-zinc-500 transition-colors group-hover:text-quantum">
            Read the report
            <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      </section>
    </LearnChrome>
  );
}
