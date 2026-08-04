import type { Metadata } from "next";
import Link from "next/link";

import { LearnChrome } from "@/components/LearnChrome";
import { GLOSSARY, GLOSSARY_CATEGORIES } from "@/lib/content/glossary";

export const metadata: Metadata = {
  title: "Options & F&O Glossary — Terms, Greeks & Rules",
  description:
    "Every term to trade Indian F&O — strikes, the Greeks, margin, OI reading, " +
    "plus DeltaK's own Aegis, Zenith and Quantum Horizon defined.",
  keywords: [
    "options trading glossary india",
    "fno terms and definitions",
    "aegis zenith quantum horizon meaning",
    "options terminology explained",
  ],
  alternates: { canonical: "/learn/glossary" },
};

export default function GlossaryHubPage() {
  return (
    <LearnChrome
      ctaLocation="learn-glossary-hub"
      viewEvent="learn_glossary_hub_view"
      crumbs={[{ label: "Learn", href: "/learn" }, { label: "Glossary" }]}
    >
      <section className="relative mx-auto max-w-4xl px-5 pb-8 pt-4 text-center">
        <h1 className="text-balance text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
          Options &amp; Indian F&amp;O glossary
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-balance text-[13.5px] leading-relaxed text-zinc-400">
          Standard exchange terminology — strikes, the Greeks, margin, settlement — alongside DeltaK&apos;s
          own vocabulary: Aegis, Zenith, the Quantum Horizon, the COA Matrix and the four DKMS protocols,
          defined in full rather than left as unexplained jargon inside the terminal.
        </p>
      </section>

      {GLOSSARY_CATEGORIES.map((category) => {
        const items = GLOSSARY.filter((g) => g.category === category);
        return (
          <section key={category} className="relative mx-auto max-w-6xl px-5 pb-10">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">{category}</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((g) => (
                <Link
                  key={g.slug}
                  href={`/learn/glossary/${g.slug}`}
                  className="dk-panel rounded-lg p-3.5 transition-colors hover:border-zinc-700"
                >
                  <h3 className="text-[13px] font-semibold text-zinc-100">{g.term}</h3>
                  <p className="mt-1 text-[12px] leading-relaxed text-zinc-500">{g.shortDef}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </LearnChrome>
  );
}
