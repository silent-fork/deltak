import type { Metadata } from "next";
import { Compass } from "lucide-react";

import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { CtaLink } from "@/components/CtaLink";
import { Wordmark } from "@/components/Wordmark";

/**
 * The one page nobody arrives at on purpose. Written in the app's own DKMS
 * vocabulary rather than generic "page not found" copy — a "fifth protocol"
 * that doesn't exist is funnier to anyone who's seen the real four (Alpha,
 * Beta, Gamma, Delta) than a stock error ever would be, and costs nothing to
 * anyone who hasn't.
 */
export const metadata: Metadata = {
  title: "404 — Off the Chain",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main className="dk-grid-bg relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-zinc-950 px-6 py-10 text-center">
      <AnalyticsBeacon event="not_found_view" />

      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-quantum/[0.08] blur-[110px]"
      />

      <div className="relative flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-md border border-quantum/40 bg-quantum/10">
          <Compass className="h-4 w-4 text-quantum" />
        </div>
        <Wordmark className="text-[16px] tracking-[0.18em]" />
      </div>

      <div className="dk-panel relative mt-8 w-full max-w-sm rounded-2xl p-7">
        <span className="inline-flex items-center gap-1.5 rounded border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wider text-rose-300">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
          Protocol Zeta — Total Void
        </span>

        <h1 className="mt-4 font-mono text-5xl font-bold tracking-tight text-quantum [text-shadow:0_0_16px_rgba(0,240,255,0.35)]">
          404
        </h1>
        <p className="mt-2 text-[13px] font-semibold text-zinc-100">
          This strike isn&apos;t on the chain.
        </p>
        <p className="mx-auto mt-2.5 max-w-[20rem] text-[12.5px] leading-relaxed text-zinc-400">
          You&apos;ve drifted further out-of-the-money than the Zero-OTM rule allows —
          RS-Ratio and RS-Momentum both read zero, because this URL was never
          quoted to begin with. No wall, no wick, no walk-back.
        </p>

        <div className="mt-6 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
          <CtaLink
            href="/"
            location="404"
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-quantum/60 bg-quantum/15 px-4 text-[12px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/25 sm:w-auto"
          >
            Back to the Homepage
          </CtaLink>
          <CtaLink
            href="/terminal"
            location="404"
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-900/60 px-4 text-[12px] font-semibold uppercase tracking-wider text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100 sm:w-auto"
          >
            Open the Terminal
          </CtaLink>
        </div>
      </div>

      <p className="relative mt-8 flex items-center justify-center gap-1.5 text-zinc-600">
        <span
          aria-hidden
          className="inline-flex h-2.5 w-4 shrink-0 flex-col overflow-hidden rounded-[2px] ring-1 ring-white/10"
        >
          <span className="h-1/3 w-full bg-[#FF9933]" />
          <span className="h-1/3 w-full bg-white" />
          <span className="h-1/3 w-full bg-[#138808]" />
        </span>
        <span className="text-[10px]">
          Made with <span className="text-rose-400">♥</span> in Bharat
        </span>
      </p>
    </main>
  );
}
