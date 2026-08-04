import { ArrowRight, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { CtaLink } from "@/components/CtaLink";

export const metadata: Metadata = {
  title: "Tools — Free NSE F&O Market Utilities",
  description:
    "DeltaK's free NSE F&O tools — sector rotation, a market scanner, an options volatility " +
    "desk, and a corporate calendar. All built on NSE's own public data.",
  alternates: { canonical: "/tools" },
  robots: { index: true, follow: true },
};

/* ---------------------------------------------------------- preview glyphs */
/* Each a small, honest miniature of the real page it launches — not a stock
   icon — so the card itself previews the tool rather than just naming it. */

function RotationGlyph() {
  const dots = [
    { x: 68, y: 22, c: "#10b981" },
    { x: 80, y: 34, c: "#10b981" },
    { x: 30, y: 70, c: "#f43f5e" },
    { x: 20, y: 60, c: "#f43f5e" },
    { x: 55, y: 40, c: "#00f0ff" },
    { x: 62, y: 55, c: "#f59e0b" },
  ];
  return (
    <svg viewBox="0 0 96 96" className="h-full w-full">
      <line x1="8" y1="48" x2="88" y2="48" stroke="#3f3f46" strokeWidth="1" />
      <line x1="48" y1="8" x2="48" y2="88" stroke="#3f3f46" strokeWidth="1" />
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r="4" fill={d.c} opacity="0.85" />
      ))}
    </svg>
  );
}

function ScannerGlyph() {
  const cells = [
    "#0d9467", "#f43f5e", "#10b981", "#3f3f46",
    "#7f1d2e", "#10b981", "#10b981", "#f59e0b",
    "#3f3f46", "#f43f5e", "#0d9467", "#10b981",
  ];
  return (
    <svg viewBox="0 0 96 96" className="h-full w-full">
      {cells.map((c, i) => {
        const col = i % 4;
        const row = Math.floor(i / 4);
        return (
          <rect key={i} x={4 + col * 23} y={4 + row * 29} width="20" height="26" rx="2" fill={c} opacity="0.85" />
        );
      })}
    </svg>
  );
}

function VolatilityGlyph() {
  return (
    <svg viewBox="0 0 96 96" className="h-full w-full">
      <path d="M10 78 A38 38 0 0 1 34 15" stroke="#f43f5e" strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.85" />
      <path d="M34 15 A38 38 0 0 1 62 15" stroke="#3f3f46" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M62 15 A38 38 0 0 1 86 78" stroke="#10b981" strokeWidth="7" fill="none" strokeLinecap="round" opacity="0.85" />
      <line x1="48" y1="74" x2="68" y2="46" stroke="#e4e4e7" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="48" cy="74" r="3.5" fill="#e4e4e7" />
    </svg>
  );
}

function CalendarGlyph() {
  const marks = [
    { col: 1, row: 0, c: "#00f0ff" },
    { col: 3, row: 0, c: "#10b981" },
    { col: 0, row: 1, c: "#00f0ff" },
    { col: 2, row: 1, c: "#a78bfa" },
    { col: 4, row: 1, c: "#00f0ff" },
    { col: 2, row: 2, c: "#10b981" },
  ];
  return (
    <svg viewBox="0 0 96 96" className="h-full w-full">
      {Array.from({ length: 5 * 3 }, (_, i) => {
        const col = i % 5;
        const row = Math.floor(i / 5);
        return <rect key={i} x={4 + col * 18} y={6 + row * 27} width="15" height="23" rx="2" fill="#232328" />;
      })}
      {marks.map((m, i) => (
        <circle key={i} cx={4 + m.col * 18 + 7.5} cy={6 + m.row * 27 + 11.5} r="3" fill={m.c} />
      ))}
    </svg>
  );
}

const TOOLS = [
  {
    href: "/tools/fno-sector-rotation",
    label: "F&O Sector Rotation",
    glyph: RotationGlyph,
    body: "A live Relative Rotation Graph across every NSE sector index versus the Nifty 50, a sector leaderboard, and top F&O-eligible picks from the leading sectors.",
    tags: ["RRG", "Sectors", "F&O picks"],
  },
  {
    href: "/tools/market-scanner",
    label: "Market Scanner",
    glyph: ScannerGlyph,
    body: "A sector heatmap sized by turnover and coloured by today's move, plus a range radar for F&O stocks sitting nearest their ~20-session high or low.",
    tags: ["Heatmap", "Range radar"],
  },
  {
    href: "/tools/volatility-desk",
    label: "Volatility Desk",
    glyph: VolatilityGlyph,
    body: "An OI-buildup compass across every F&O stock's near-month future, max pain and PCR for NIFTY/BANKNIFTY/FINNIFTY, and an India VIX regime tracker.",
    tags: ["OI buildup", "Max pain", "PCR", "VIX"],
  },
  {
    href: "/tools/corporate-calendar",
    label: "Corporate Calendar",
    glyph: CalendarGlyph,
    body: "Results, corporate actions and IPO milestones for the week ahead — F&O names flagged — plus today's block deals and recent IPO listings.",
    tags: ["Results", "Actions", "IPOs", "Block deals"],
  },
] as const;

export default function ToolsHubPage() {
  return (
    <main className="dk-grid-bg relative min-h-dvh overflow-hidden bg-zinc-950">
      <AnalyticsBeacon event="tools_hub_view" />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-quantum/[0.07] blur-[140px]"
      />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-quantum/40 bg-quantum/10">
            <Zap className="h-4 w-4 text-quantum" />
          </div>
          <span className="font-mono text-[15px] font-bold tracking-[0.18em] text-zinc-100">
            DELTA<span className="text-quantum">K</span>
          </span>
        </Link>
        <CtaLink
          href="/terminal"
          location="tools-hub-nav"
          className="flex h-9 items-center gap-1.5 rounded-md border border-quantum/50 bg-quantum/10 px-3.5 text-[11px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/20"
        >
          Terminal
          <ArrowRight className="h-3.5 w-3.5" />
        </CtaLink>
      </header>

      <section className="relative mx-auto max-w-4xl px-5 pb-10 pt-4 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-400">
          Free · Real NSE Data
        </span>
        <h1 className="mt-4 text-balance text-3xl font-bold tracking-tight text-zinc-50 sm:text-4xl">
          NSE F&amp;O tools
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-balance text-[14px] leading-relaxed text-zinc-400">
          Four instrument panels built on NSE&apos;s own public bhavcopy, option-chain and
          corporate data — the same reliability discipline as the terminal itself.
        </p>
      </section>

      <section className="relative mx-auto max-w-6xl px-5 pb-16">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {TOOLS.map((t) => (
            <CtaLink
              key={t.href}
              href={t.href}
              location={t.href}
              event="tool_open"
              className="dk-panel group flex gap-4 rounded-xl p-4 transition-colors hover:border-quantum/40 sm:p-5"
            >
              <div className="h-16 w-16 shrink-0 rounded-lg border border-zinc-800 bg-zinc-950/60 p-2 sm:h-20 sm:w-20">
                <t.glyph />
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <h2 className="text-[15px] font-semibold text-zinc-100">{t.label}</h2>
                <p className="mt-1.5 flex-1 text-[12.5px] leading-relaxed text-zinc-500">{t.body}</p>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  {t.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded border border-zinc-800 bg-zinc-900/60 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-600"
                    >
                      {tag}
                    </span>
                  ))}
                  <span className="ml-auto flex items-center gap-1 font-mono text-[11px] font-semibold text-zinc-500 transition-colors group-hover:text-quantum">
                    Open
                    <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </div>
            </CtaLink>
          ))}
        </div>
      </section>

      <footer className="relative mx-auto max-w-6xl px-5 pb-10 text-center">
        <p className="text-[10px] leading-relaxed text-zinc-600">
          Every tool here reads NSE&apos;s own public bhavcopy, option-chain and corporate data —
          not investment advice, and not a live broker feed.
        </p>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-zinc-600">
          <span
            aria-hidden
            className="inline-flex h-2.5 w-4 shrink-0 flex-col overflow-hidden rounded-[2px] ring-1 ring-white/10"
          >
            <span className="h-1/3 w-full bg-[#FF9933]" />
            <span className="h-1/3 w-full bg-white" />
            <span className="h-1/3 w-full bg-[#138808]" />
          </span>
          Made with <span className="text-rose-400">♥</span> in Bharat
        </p>
      </footer>
    </main>
  );
}
