import { ArrowRight, ChevronRight, Zap } from "lucide-react";
import Link from "next/link";

import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { CtaLink } from "@/components/CtaLink";
import { Wordmark } from "@/components/Wordmark";

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

      <section className="relative mx-auto max-w-3xl px-5 pb-16 text-center">
        <div className="dk-panel rounded-xl px-6 py-8">
          <h2 className="text-lg font-bold text-zinc-50">See it read live, not just diagrammed</h2>
          <p className="mx-auto mt-2 max-w-md text-[13px] leading-relaxed text-zinc-500">
            DeltaK reads Aegis and Zenith wall migration and RRG rotation live across
            NIFTY, BANKNIFTY and FINNIFTY — sign in with your own Angel One account
            and watch it work in Paper mode.
          </p>
          <CtaLink
            href="/terminal"
            location={`${ctaLocation}-closing`}
            className="mt-5 inline-flex h-10 items-center justify-center gap-2 rounded-md border border-quantum/60 bg-quantum/15 px-6 text-[12.5px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/25"
          >
            Terminal
            <ArrowRight className="h-4 w-4" />
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
