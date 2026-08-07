import type { Metadata } from "next";

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { LearnChrome } from "@/components/LearnChrome";
import { FaqAccordion } from "@/components/FaqAccordion";
import { FAQS } from "@/lib/content/faq";

// Kept under 60 rendered chars (raw + the root layout's 18-char
// " · Quantum Horizon" template suffix) — the previous title ran to 68
// rendered and got truncated in search results.
const TITLE = "FAQ — DKMS Strategy, Sizing & Brokers";
const DESCRIPTION =
  "Answers on DKMS — the wall-and-rotation strategy, limit entry and thesis " +
  "tracking, position sizing, supported brokers, and the mobile companion.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "deltak faq",
    "dkms strategy explained",
    "aegis zenith wall",
    "thesis exit options",
    "options position sizing calculator",
    "angel one dhan options trading",
    "options trading mobile app india",
  ],
  alternates: { canonical: "/faq" },
  // Without this the page silently inherited the root layout's og:title/
  // description/url (the homepage's) on every share — same bug found and
  // fixed on /learn/backtest, now closed here too.
  openGraph: {
    type: "website",
    url: "/faq",
    siteName: "Quantum Horizon",
    title: TITLE,
    description: DESCRIPTION,
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
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
