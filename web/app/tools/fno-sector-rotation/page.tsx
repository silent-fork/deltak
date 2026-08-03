import type { Metadata } from "next";
import { ArrowRight, Zap } from "lucide-react";

import { CtaLink } from "@/components/CtaLink";
import { SectorDashboard } from "@/components/fno/SectorDashboard";

/**
 * Public F&O sector-rotation dashboard — no DeltaK login required, and
 * deliberately never touches Angel One (see `lib/sectors/*`, all sourced
 * from NSE's own bhavcopy/constituent data via `nse-bse-api` and
 * niftyindices.com). Unlike `/terminal`, this route *is* indexed: there is
 * real, unique content behind it without any gate.
 *
 * Lives under `/tools/` rather than at the root — the first of what's meant
 * to become a small family of free, no-login market-data utilities, so the
 * URL says that from the start instead of needing a redirect once a second
 * one exists.
 */
export const metadata: Metadata = {
  title: "F&O Sector Rotation Dashboard — NSE Sector RRG & Top F&O Stock Picks",
  description:
    "A free NSE F&O sector rotation dashboard — a live Relative Rotation Graph " +
    "(RRG) across every NSE sector index versus the Nifty 50, a sector leaderboard, and " +
    "top F&O-eligible stock picks from the leading sectors. Built on NSE's own public " +
    "bhavcopy and constituent data.",
  alternates: {
    canonical: "/tools/fno-sector-rotation",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const dynamic = "force-dynamic";

/**
 * Fills the viewport on desktop (`lg:h-dvh lg:overflow-hidden`, same pattern
 * `Terminal.tsx` uses) rather than a plain document-flow page — a short
 * dashboard on a tall monitor otherwise leaves dead space below the fold
 * instead of the hero RRG/leaderboard row actually using it. Below `lg`
 * there is no such thing as "leftover space" on a phone, so it reverts to
 * an ordinary scrolling page there.
 */
export default function FnoRotationPage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 lg:h-dvh lg:overflow-hidden">
      <header className="shrink-0 border-b border-zinc-800/70 bg-zinc-900/40 px-3 py-3 backdrop-blur-sm sm:px-6">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-quantum/50 bg-quantum/10">
              <Zap className="h-3.5 w-3.5 text-quantum" />
            </span>
            <span className="font-mono text-sm font-bold tracking-wider text-zinc-100">
              DELTA<span className="text-quantum">K</span>
            </span>
          </div>
          {/*
            Hidden below `sm` — on a phone the logo and Terminal button
            already fill the row on their own; the title just wraps it onto
            a second line for no benefit when the page itself already says
            what it is.
          */}
          <div className="hidden min-w-0 sm:block">
            <h1 className="truncate text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300 sm:text-xs">
              F&amp;O Sector Rotation
            </h1>
          </div>
          <CtaLink
            href="/terminal"
            location="fno-nav"
            className="ml-auto flex h-8 items-center gap-1.5 rounded-md border border-quantum/50 bg-quantum/10 px-3 text-[10px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/20"
          >
            Terminal
            <ArrowRight className="h-3 w-3" />
          </CtaLink>
        </div>
      </header>

      <main className="dk-scroll mx-auto flex w-full min-h-0 max-w-[1600px] flex-1 flex-col px-3 py-3 sm:px-6 sm:py-4 lg:overflow-y-auto">
        <SectorDashboard />
      </main>
    </div>
  );
}
