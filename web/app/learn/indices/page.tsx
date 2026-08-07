import { CheckCircle2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LearnChrome } from "@/components/LearnChrome";
import { LotSizeBars } from "@/components/LotSizeBars";
import { INDICES } from "@/lib/content/indices";

// Kept under 60 rendered chars (raw + the root layout's 18-char
// " · Quantum Horizon" template suffix) — the previous title ran to 64
// rendered and got truncated in search results.
const TITLE = "Indian F&O Indices — NIFTY & BANKNIFTY";
const DESCRIPTION =
  "Every major Indian index F&O contract compared — NIFTY, Bank Nifty, Sensex, " +
  "Bankex — lot size, strike step and exchange.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "indian fno indices",
    "nifty banknifty finnifty lot size",
    "nse bse index options list",
    "nifty lot size 2026",
    "index options expiry day india",
  ],
  alternates: { canonical: "/learn/indices" },
  // Without this the page silently inherited the root layout's og:title/
  // description/url (the homepage's) on every share — same bug found and
  // fixed on /learn/backtest, now closed here too.
  openGraph: {
    type: "website",
    url: "/learn/indices",
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

export default function IndicesHubPage() {
  return (
    <LearnChrome
      ctaLocation="learn-indices-hub"
      viewEvent="learn_indices_hub_view"
      crumbs={[{ label: "Learn", href: "/learn" }, { label: "Indices" }]}
    >
      <section className="relative mx-auto max-w-4xl px-5 pb-8 pt-4 text-center">
        <h1 className="text-balance text-2xl font-bold tracking-tight text-zinc-50 sm:text-3xl">
          Indian F&amp;O indices
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-balance text-[13.5px] leading-relaxed text-zinc-400">
          Every major index options contract traded on NSE and BSE — Quantum Horizon reads and trades
          NIFTY, BANKNIFTY and FINNIFTY live; the rest are covered here for reference.
        </p>
      </section>

      <section className="relative mx-auto max-w-6xl px-5 pb-8">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-zinc-500">Lot size by index</h2>
        <LotSizeBars indices={INDICES} />
      </section>

      <section className="relative mx-auto max-w-6xl px-5 pb-8">
        <div className="dk-panel overflow-x-auto rounded-lg">
          <table className="w-full min-w-[560px] text-left text-[12.5px]">
            <thead>
              <tr className="border-b border-zinc-800/70 text-[9px] uppercase tracking-wider text-zinc-600">
                <th className="px-4 py-2.5 font-medium">Index</th>
                <th className="px-4 py-2.5 font-medium">Exchange</th>
                <th className="px-4 py-2.5 text-right font-medium">Lot Size</th>
                <th className="px-4 py-2.5 text-right font-medium">Strike Step</th>
                <th className="px-4 py-2.5 text-right font-medium">Live</th>
              </tr>
            </thead>
            <tbody>
              {INDICES.map((idx) => (
                <tr key={idx.slug} className="border-t border-zinc-800/70">
                  <td className="px-4 py-2.5">
                    <Link href={`/learn/indices/${idx.slug}`} className="font-semibold text-zinc-200 hover:text-quantum">
                      {idx.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-500">{idx.exchange}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-zinc-300">{idx.lotSize ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-zinc-300">{idx.strikeStep ?? "—"}</td>
                  <td className="px-4 py-2.5 text-right">
                    {idx.tradedByDeltaK ? (
                      <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-quantum" />
                    ) : (
                      <XCircle className="ml-auto h-3.5 w-3.5 text-zinc-700" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
          Lot sizes and strike steps are revised periodically by the exchange under SEBI&apos;s notional-value
          rules — figures for NIFTY, BANKNIFTY and FINNIFTY come straight from Quantum Horizon&apos;s own
          live engine configuration; the rest link through to the exchange&apos;s current contract note.
        </p>
      </section>
    </LearnChrome>
  );
}
