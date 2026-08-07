import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LearnChrome } from "@/components/LearnChrome";
import { GLOSSARY } from "@/lib/content/glossary";
import { INDICES } from "@/lib/content/indices";
import { STRATEGIES } from "@/lib/content/strategies";
import { TRADING_STYLES } from "@/lib/content/tradingStyles";

// Kept under 60 rendered chars (raw + the root layout's 18-char
// " · Quantum Horizon" template suffix) — the previous title ran to 85
// rendered and got truncated hard in search results.
const TITLE = "Options Trading Wiki — F&O Reference";
const DESCRIPTION =
  "The Quantum Horizon Wiki — a free options trading reference: strategy payoff diagrams, " +
  "a full F&O glossary, trading styles and Indian index reference.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "options trading wiki india",
    "learn options trading nifty banknifty",
    "aegis zenith quantum horizon deltak",
    "indian fno education",
  ],
  alternates: { canonical: "/learn" },
  // Without this the page silently inherited the root layout's og:title/
  // description/url (the homepage's) on every share — same bug found and
  // fixed on /learn/backtest, now closed here too.
  openGraph: {
    type: "website",
    url: "/learn",
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

/* ---------------------------------------------------------- preview glyphs */
/* Each one a miniature of the real visual language its own section already
   uses — the strategy pages' payoff diagrams, the trading-styles page's
   horizon bar, the indices page's lot-size bars — rather than a stock
   icon standing in for the category. */

function StrategyGlyph() {
  return (
    <svg viewBox="0 0 92 60" className="h-full w-full">
      <line x1="4" y1="30" x2="88" y2="30" stroke="#27272a" strokeWidth="1" />
      <path d="M4 42 L40 42 L80 8" fill="none" stroke="#e4e4e7" strokeWidth="2" strokeLinejoin="round" />
      <path d="M4 42 L40 42 L80 8 L80 42 Z" fill="#10b981" fillOpacity="0.18" />
      <path d="M4 42 L40 42 L4 42 Z" fill="#f43f5e" fillOpacity="0.16" />
      <line x1="40" y1="8" x2="40" y2="52" stroke="#00f0ff" strokeOpacity="0.4" strokeDasharray="2 2" />
    </svg>
  );
}

function GlossaryGlyph() {
  const widths = [58, 40, 66, 30];
  return (
    <svg viewBox="0 0 92 60" className="h-full w-full">
      {widths.map((w, i) => (
        <rect key={i} x="4" y={4 + i * 14} width={w} height="9" rx="4" fill={i === 0 || i === 2 ? "#00f0ff" : "#3f3f46"} opacity={i === 0 || i === 2 ? 0.35 : 0.7} />
      ))}
    </svg>
  );
}

function StyleGlyph() {
  return (
    <svg viewBox="0 0 92 60" className="h-full w-full">
      <rect x="4" y="24" width="84" height="10" rx="5" fill="#27272a" />
      <rect x="4" y="24" width="34" height="10" rx="5" fill="#00f0ff" fillOpacity="0.55" />
      <text x="4" y="46" fontSize="7" fill="#52525b" fontFamily="ui-monospace, monospace">INTRADAY</text>
      <text x="60" y="46" fontSize="7" fill="#52525b" fontFamily="ui-monospace, monospace">POSITIONAL</text>
    </svg>
  );
}

function IndexGlyph() {
  const heights = [34, 14, 26, 20, 30];
  return (
    <svg viewBox="0 0 92 60" className="h-full w-full">
      {heights.map((h, i) => (
        <rect key={i} x={4 + i * 18} y={52 - h} width="12" height={h} rx="2" fill="#00f0ff" opacity={0.3 + i * 0.13} />
      ))}
    </svg>
  );
}

function BacktestGlyph() {
  return (
    <svg viewBox="0 0 92 60" className="h-full w-full">
      <line x1="4" y1="14" x2="88" y2="14" stroke="#27272a" strokeWidth="1" />
      <line x1="4" y1="30" x2="88" y2="30" stroke="#27272a" strokeWidth="1" />
      <line x1="4" y1="46" x2="88" y2="46" stroke="#27272a" strokeWidth="1" />
      <path
        d="M4 44 L14 42 L24 38 L34 30 L44 24 L54 16 L64 14 L74 10 L88 6"
        fill="none"
        stroke="#00f0ff"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M4 44 L14 42 L24 38 L34 30 L44 24 L54 16 L64 14 L74 10 L88 6 L88 54 L4 54 Z" fill="#00f0ff" fillOpacity="0.12" />
    </svg>
  );
}

const SECTIONS = [
  {
    href: "/learn/strategies",
    glyph: StrategyGlyph,
    title: "Strategies",
    count: `${STRATEGIES.length} setups`,
    body: "From a plain long call through iron condors and the jade lizard, each with a payoff diagram, construction and the mistakes that break it.",
  },
  {
    href: "/learn/glossary",
    glyph: GlossaryGlyph,
    title: "Glossary",
    count: `${GLOSSARY.length} terms`,
    body: "Strikes, the Greeks, margin and settlement rules, OI reading — plus DeltaK's own Aegis, Zenith, Quantum Horizon and DKMS terms, defined in full.",
  },
  {
    href: "/learn/trading-styles",
    glyph: StyleGlyph,
    title: "Trading Styles",
    count: `${TRADING_STYLES.length} styles`,
    body: "Intraday, swing and positional options trading compared, and the buying-vs-selling decision that cuts across all three.",
  },
  {
    href: "/learn/indices",
    glyph: IndexGlyph,
    title: "Indices",
    count: `${INDICES.length} contracts`,
    body: "NIFTY, BANKNIFTY, FINNIFTY and every other major Indian index F&O contract — lot size, strike step, exchange.",
  },
] as const;

export default function LearnHubPage() {
  return (
    <LearnChrome ctaLocation="learn-hub" viewEvent="learn_hub_view" crumbs={[{ label: "Learn" }]}>
      <section className="relative mx-auto max-w-4xl px-5 pb-8 pt-4 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
          Free · No login · Reference
        </span>
        <h1 className="mt-4 text-balance text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
          The Quantum Horizon Wiki
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-balance text-[14px] leading-relaxed text-zinc-400">
          Strategy setups, a full glossary, trading styles and Indian F&amp;O index reference — including
          plain-English definitions of Aegis, Zenith and the Quantum Horizon, the same vocabulary the
          terminal itself trades on.
        </p>
      </section>

      <section className="relative mx-auto max-w-6xl px-5 pb-10">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="dk-panel group flex gap-4 rounded-lg p-5 transition-colors hover:border-quantum/40"
            >
              <div className="h-16 w-16 shrink-0 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2">
                <s.glyph />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-semibold text-zinc-100">{s.title}</h2>
                  <span className="rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                    {s.count}
                  </span>
                </div>
                <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-zinc-500">{s.body}</p>
                <span className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-zinc-500 transition-colors group-hover:text-quantum">
                  Browse
                  <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/*
        The other four cards are reference — browse N items. This one is
        proof, not reference, so it doesn't get folded into the same grid as
        a fifth tile with nothing to differentiate it: its own row, a
        quantum-lit border, and the actual headline numbers up front rather
        than a "Browse" link with no sense of what's behind it.
      */}
      <section className="relative mx-auto max-w-6xl px-5 pb-8">
        <Link
          href="/learn/backtest"
          className="group relative flex flex-col gap-5 overflow-hidden rounded-lg border border-quantum/30 bg-quantum/[0.05] p-5 transition-colors hover:border-quantum/50 sm:flex-row sm:items-center sm:gap-6"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-quantum/[0.10] blur-[90px]"
          />
          <div className="relative flex gap-4 sm:flex-1">
            <div className="h-16 w-16 shrink-0 rounded-lg border border-quantum/30 bg-zinc-950/60 p-2">
              <BacktestGlyph />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] font-semibold uppercase tracking-wider text-quantum">
                  Backtesting &amp; performance report
                </span>
                <span className="rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-600">
                  18 months
                </span>
              </div>
              <h2 className="mt-1 text-[15px] font-semibold text-zinc-100">
                18 months, run past its own Quantum Horizon
              </h2>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-zinc-500">
                The full DKMS walk-forward backtest — strategy configuration, attribution by index and
                protocol, and a worked trade, numbers included.
              </p>
            </div>
          </div>

          <div className="relative flex shrink-0 items-center justify-between gap-5 border-t border-quantum/15 pt-4 sm:justify-start sm:gap-6 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
            {[
              { label: "Sharpe", value: "6.06" },
              { label: "Max DD", value: "−11.2%" },
              { label: "Win rate", value: "71.8%" },
            ].map((k) => (
              <div key={k.label}>
                <div className="font-mono text-[15px] font-semibold text-zinc-100">{k.value}</div>
                <div className="mt-0.5 font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">{k.label}</div>
              </div>
            ))}
            <span className="flex items-center gap-1 font-mono text-[11px] font-semibold text-zinc-500 transition-colors group-hover:text-quantum">
              Read
              <ArrowRight className="h-3 w-3" />
            </span>
          </div>
        </Link>
      </section>

      <section className="relative mx-auto max-w-6xl px-5 pb-8">
        <div className="dk-panel rounded-lg p-5">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">
            DeltaK&apos;s own terminology
          </h2>
          <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {[
              { slug: "aegis", label: "Aegis" },
              { slug: "zenith", label: "Zenith" },
              { slug: "quantum-horizon", label: "Quantum Horizon" },
              { slug: "dkms-protocols", label: "DKMS Protocols" },
            ].map((t) => (
              <Link
                key={t.slug}
                href={`/learn/glossary/${t.slug}`}
                className="rounded-md border border-zinc-800 bg-zinc-900/40 px-3 py-2.5 text-center text-[12px] font-semibold text-zinc-300 transition-colors hover:border-quantum/40 hover:text-quantum"
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </LearnChrome>
  );
}
