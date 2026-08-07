import { ArrowRight, ChevronRight, Zap } from "lucide-react";
import Link from "next/link";

import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { CtaLink } from "@/components/CtaLink";
import { Wordmark } from "@/components/Wordmark";

const SITE_URL =
  process.env.NEXT_PUBLIC_DK_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/**
 * Shared chrome for every `/tools/*` dashboard — the header (logo, title,
 * breadcrumb back to the `/tools` hub, Terminal CTA) and the full-height
 * layout shell, so each tool's own page.tsx only has to bring its title and
 * its dashboard component.
 *
 * Fills the viewport on desktop (`lg:h-dvh lg:overflow-hidden`, same
 * pattern `Terminal.tsx` uses) rather than a plain document-flow page — a
 * short dashboard on a tall monitor otherwise leaves dead space below the
 * fold instead of its hero row actually using it. Below `lg` there is no
 * such thing as "leftover space" on a phone, so it reverts to an ordinary
 * scrolling page there — first proven out on the sector-rotation dashboard,
 * now shared across the whole `/tools` family.
 */
export function ToolPageShell({
  title,
  navLocation,
  viewEvent,
  children,
}: {
  /** Short header label — hidden below `sm`, same as the sector-rotation page. */
  title: string;
  /** `CtaLink`'s `location` for this page's Terminal button click. */
  navLocation: string;
  /** Snake_case Zaraz event fired once on mount, e.g. "tools_market_scanner_view". */
  viewEvent: string;
  children: React.ReactNode;
}) {
  // The visible "Tools > {title}" trail in the header below already existed —
  // this is the structured-data twin of it. The last crumb deliberately has
  // no `item` URL, per Google's own guidance: it's the current page, nothing
  // above it in the breadcrumb needs to resolve anywhere new.
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Tools", item: `${SITE_URL}/tools` },
      { "@type": "ListItem", position: 3, name: title },
    ],
  };

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 lg:h-dvh lg:overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <AnalyticsBeacon event={viewEvent} />
      <header className="shrink-0 border-b border-zinc-800/70 bg-zinc-900/40 px-3 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-1.5">
          <Link href="/tools" className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-quantum/50 bg-quantum/10">
              <Zap className="h-3.5 w-3.5 text-quantum" />
            </span>
            <Wordmark className="text-sm tracking-wider" />
          </Link>
          <div className="hidden min-w-0 items-center gap-1.5 sm:flex">
            <Link
              href="/tools"
              className="font-mono text-[11px] uppercase tracking-[0.14em] text-zinc-600 transition-colors hover:text-quantum"
            >
              Tools
            </Link>
            <ChevronRight className="h-3 w-3 text-zinc-700" />
            <h1 className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300 sm:text-xs">
              {title}
            </h1>
          </div>
          <CtaLink
            href="/terminal"
            location={navLocation}
            className="ml-auto flex h-8 items-center gap-1.5 rounded-md border border-quantum/50 bg-quantum/10 px-3 text-[10px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/20"
          >
            Terminal
            <ArrowRight className="h-3 w-3" />
          </CtaLink>
        </div>
      </header>

      <main className="dk-scroll mx-auto flex w-full min-h-0 max-w-[1600px] flex-1 flex-col px-3 py-3 sm:px-6 sm:py-4 lg:overflow-y-auto">
        {children}
      </main>
    </div>
  );
}

/** The tricolour "Made with in Bharat" line every /tools footer ends on. */
export function ToolFooterMark({ sourceNote }: { sourceNote: string }) {
  return (
    <div className="flex shrink-0 flex-col items-center justify-center gap-1.5 py-2">
      <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-700">
        <Zap className="h-2.5 w-2.5" />
        {sourceNote}
      </span>
      <span className="flex items-center gap-1.5 text-[10px] text-zinc-600">
        <span
          aria-hidden
          className="inline-flex h-2 w-3 shrink-0 flex-col overflow-hidden rounded-[2px] ring-1 ring-white/10"
        >
          <span className="h-1/3 w-full bg-[#FF9933]" />
          <span className="h-1/3 w-full bg-white" />
          <span className="h-1/3 w-full bg-[#138808]" />
        </span>
        Made with <span className="text-rose-400">♥</span> in Bharat
      </span>
    </div>
  );
}
