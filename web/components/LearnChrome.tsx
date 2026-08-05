import { ArrowRight, ChevronRight, Zap } from "lucide-react";
import Link from "next/link";

import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { CtaLink } from "@/components/CtaLink";
import { Wordmark } from "@/components/Wordmark";

/** A miniature of the terminal's own RRG quadrant plot — not a stock icon. */
function RotationGlyph() {
  const dots: [number, number, string][] = [
    [64, 20, "#10b981"],
    [74, 30, "#10b981"],
    [26, 68, "#f43f5e"],
    [18, 58, "#f43f5e"],
    [50, 38, "#00f0ff"],
    [58, 52, "#f59e0b"],
  ];
  return (
    <svg viewBox="0 0 92 92" className="h-6 w-6">
      <line x1="6" y1="46" x2="86" y2="46" stroke="#3f3f46" strokeWidth="1" />
      <line x1="46" y1="6" x2="46" y2="86" stroke="#3f3f46" strokeWidth="1" />
      {dots.map(([x, y, c], i) => (
        <circle key={i} cx={x} cy={y} r="4" fill={c} opacity="0.9" />
      ))}
    </svg>
  );
}

/**
 * Shared shell for every /learn page — the wiki's own header, breadcrumb
 * rail and closing CTA/disclaimer, so the dozens of dynamic strategy,
 * glossary, trading-style and index pages don't each re-implement the same
 * chrome around their content.
 *
 * Also the one place that fires each page's view event — every /learn leaf
 * is a Server Component, so without this nothing would ever tell Zaraz a
 * human actually read the page rather than just clicked a CTA on it.
 */
export function LearnChrome({
  crumbs,
  children,
  ctaLocation,
  viewEvent,
  viewData,
}: {
  crumbs: { label: string; href?: string }[];
  children: React.ReactNode;
  ctaLocation: string;
  /** Snake_case Zaraz event fired once on mount, e.g. "learn_strategy_view". */
  viewEvent: string;
  viewData?: Record<string, unknown>;
}) {
  return (
    <main className="dk-grid-bg relative min-h-dvh overflow-hidden bg-zinc-950">
      <AnalyticsBeacon event={viewEvent} data={viewData} />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-quantum/[0.07] blur-[140px]"
      />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-quantum/40 bg-quantum/10">
            <Zap className="h-4 w-4 text-quantum" />
          </div>
          <Wordmark className="text-[15px] tracking-[0.18em]" />
        </Link>
        <CtaLink
          href="/terminal"
          location={ctaLocation}
          className="flex h-9 items-center gap-1.5 rounded-md border border-quantum/50 bg-quantum/10 px-3.5 text-[11px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/20"
        >
          Terminal
          <ArrowRight className="h-3.5 w-3.5" />
        </CtaLink>
      </header>

      <nav
        aria-label="Breadcrumb"
        className="relative mx-auto flex max-w-6xl flex-wrap items-center gap-1.5 px-5 pb-2 font-mono text-[10.5px] uppercase tracking-wider text-zinc-600"
      >
        {crumbs.map((c, i) => (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3 w-3 text-zinc-700" />}
            {c.href ? (
              <Link href={c.href} className="transition-colors hover:text-quantum">
                {c.label}
              </Link>
            ) : (
              <span className="text-zinc-400">{c.label}</span>
            )}
          </span>
        ))}
      </nav>

      {children}

      {/*
        Was a full-width, centered, ~230px-tall box with the same copy on
        every single /learn page — strategies, glossary, trading styles,
        indices, and every leaf beneath them. Repeated that often, its size
        read as filler rather than a real closing beat, especially on the
        thinner pages (trading styles' four cards, in particular) where it
        dwarfed the actual content above it. Compact and asymmetric instead:
        a live-rotation glyph earns its keep as the one thing on this panel
        that isn't text, the copy sits left instead of centered, and the
        whole thing is short enough to read as a footer beat, not a second
        hero.
      */}
      <section className="relative mx-auto max-w-4xl px-5 pb-12">
        <div className="dk-panel relative flex flex-col items-center gap-4 overflow-hidden rounded-xl px-5 py-5 text-center sm:flex-row sm:justify-between sm:text-left">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-14 -top-14 h-40 w-40 rounded-full bg-quantum/[0.09] blur-[70px]"
          />
          <div className="relative flex flex-col items-center gap-3.5 sm:flex-row">
            <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-quantum/30 bg-quantum/10 sm:flex">
              <RotationGlyph />
            </span>
            <div>
              <h2 className="text-[14px] font-bold text-zinc-50">
                See it read live, not just diagrammed
              </h2>
              <p className="mt-1 max-w-md text-[12px] leading-relaxed text-zinc-500">
                Quantum Horizon reads Aegis/Zenith wall migration and RRG rotation live across
                NIFTY, BANKNIFTY and FINNIFTY — sign in and watch it work in Paper mode.
              </p>
            </div>
          </div>
          <CtaLink
            href="/terminal"
            location={`${ctaLocation}-closing`}
            className="relative flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-quantum/60 bg-quantum/15 px-4 text-[11px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/25"
          >
            Terminal
            <ArrowRight className="h-3.5 w-3.5" />
          </CtaLink>
        </div>
      </section>

      <footer className="relative mx-auto max-w-6xl px-5 pb-8 text-center text-[10px] leading-relaxed text-zinc-600">
        <p>
          Educational content only, not investment advice. Options trading carries substantial risk
          of loss — examples on this page use illustrative figures, not live market quotes.
        </p>
      </footer>
    </main>
  );
}

export function ComplexityBadge({ level }: { level: string }) {
  const tone =
    level === "Advanced"
      ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
      : level === "Intermediate"
        ? "border-quantum/40 bg-quantum/10 text-quantum"
        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  return (
    <span
      className={`shrink-0 whitespace-nowrap rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${tone}`}
    >
      {level}
    </span>
  );
}
