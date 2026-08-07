import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { AnalyticsBeacon } from "@/components/AnalyticsBeacon";
import { BrandIcon } from "@/components/BrandIcon";
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

      <div className="relative flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md border border-quantum/40 bg-quantum/10">
          <BrandIcon size="md" />
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

        <div aria-hidden className="relative mt-5 h-10 w-full">
          <svg viewBox="0 0 320 40" className="h-full w-full">
            <path
              d="M0 20 L110 20 L128 6 L144 34 L160 20 L320 20"
              fill="none"
              stroke="#3f3f46"
              strokeWidth={1.5}
            />
            <path d="M160 20 L320 20" fill="none" stroke="#f43f5e" strokeWidth={1.5} strokeDasharray="4 4" />
            <circle cx={160} cy={20} r={3} fill="#18181b" stroke="#f43f5e" strokeWidth={1.5} />
          </svg>
          <span className="absolute right-0 top-0 -translate-y-full font-mono text-[8px] uppercase tracking-wider text-rose-400/80">
            signal ends here
          </span>
        </div>

        <div className="mt-2 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
          <CtaLink
            href="/"
            location="404"
            className="flex h-9 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-quantum/60 bg-quantum/15 px-5 text-[12px] font-semibold uppercase tracking-wider text-quantum transition-colors hover:bg-quantum/25 sm:w-auto"
          >
            Homepage
          </CtaLink>
          <CtaLink
            href="/terminal"
            location="404"
            className="flex h-9 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-zinc-700 bg-zinc-900/60 px-5 text-[12px] font-semibold uppercase tracking-wider text-zinc-300 transition-colors hover:border-zinc-600 hover:text-zinc-100 sm:w-auto"
          >
            Terminal
            <ArrowRight className="h-3.5 w-3.5 shrink-0" />
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
