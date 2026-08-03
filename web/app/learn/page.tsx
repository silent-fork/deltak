import { ArrowRight, BookOpen, Layers, LineChart, Sigma } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LearnChrome } from "@/components/LearnChrome";

export const metadata: Metadata = {
  title: "Learn — Options Strategies, Glossary & Indian F&O Reference | DeltaK",
  description:
    "DeltaK's free options trading wiki — strategy setups with payoff diagrams, a full options and F&O glossary (including Aegis, Zenith and the Quantum Horizon), trading styles, and every major Indian index F&O contract compared.",
  keywords: [
    "options trading wiki india",
    "learn options trading nifty banknifty",
    "aegis zenith quantum horizon deltak",
    "indian fno education",
  ],
  alternates: { canonical: "/learn" },
};

const SECTIONS = [
  {
    href: "/learn/strategies",
    icon: Sigma,
    title: "Strategies",
    body: "Twelve setups from a plain long call through iron condors and the jade lizard, each with a payoff diagram, construction and the mistakes that break it.",
  },
  {
    href: "/learn/glossary",
    icon: BookOpen,
    title: "Glossary",
    body: "Strikes, the Greeks, margin and settlement rules, OI reading — plus DeltaK's own Aegis, Zenith, Quantum Horizon, COA Matrix and DKMS terms, defined in full.",
  },
  {
    href: "/learn/trading-styles",
    icon: LineChart,
    title: "Trading Styles",
    body: "Intraday, swing and positional options trading compared, and the buying-vs-selling decision that cuts across all three.",
  },
  {
    href: "/learn/indices",
    icon: Layers,
    title: "Indices",
    body: "NIFTY, BANKNIFTY, FINNIFTY and every other major Indian index F&O contract — lot size, strike step, exchange.",
  },
] as const;

export default function LearnHubPage() {
  return (
    <LearnChrome ctaLocation="learn-hub" viewEvent="learn_hub_view" crumbs={[{ label: "Learn" }]}>
      <section className="relative mx-auto max-w-4xl px-5 pb-10 pt-4 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
          Free · No login · Static reference
        </span>
        <h1 className="mt-4 text-balance text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
          The DeltaK options trading wiki
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-balance text-[14px] leading-relaxed text-zinc-400">
          Strategy setups, a full glossary, trading styles and Indian F&amp;O index reference — including
          plain-English definitions of Aegis, Zenith and the Quantum Horizon, the same vocabulary the
          terminal itself trades on.
        </p>
      </section>

      <section className="relative mx-auto max-w-6xl px-5 pb-14">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="dk-panel group flex flex-col rounded-lg p-5 transition-colors hover:border-zinc-700"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-md border border-quantum/30 bg-quantum/10">
                <s.icon className="h-4 w-4 text-quantum" />
              </div>
              <h2 className="mt-3 text-[15px] font-semibold text-zinc-100">{s.title}</h2>
              <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-zinc-500">{s.body}</p>
              <span className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-zinc-500 transition-colors group-hover:text-quantum">
                Browse
                <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-6xl px-5 pb-4">
        <h2 className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
          DeltaK&apos;s own terminology
        </h2>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { slug: "aegis", label: "Aegis" },
            { slug: "zenith", label: "Zenith" },
            { slug: "quantum-horizon", label: "Quantum Horizon" },
            { slug: "dkms-protocols", label: "DKMS Protocols" },
          ].map((t) => (
            <Link
              key={t.slug}
              href={`/learn/glossary/${t.slug}`}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-3 text-center text-[12px] font-semibold text-zinc-300 transition-colors hover:border-quantum/40 hover:text-quantum"
            >
              {t.label}
            </Link>
          ))}
        </div>
      </section>
    </LearnChrome>
  );
}
