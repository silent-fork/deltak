import { CheckCircle2, XCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { LearnChrome } from "@/components/LearnChrome";
import { LotSizeBars } from "@/components/LotSizeBars";
import { INDICES } from "@/lib/content/indices";

export const metadata: Metadata = {
  title: "Indian F&O Indices — NIFTY, BANKNIFTY, FINNIFTY, Sensex & More",
  description:
    "Every major Indian index F&O contract compared — NIFTY 50, Bank Nifty, Fin Nifty, Midcap Nifty on NSE, plus Sensex and Bankex on BSE — lot size, strike step and which ones DeltaK actually trades.",
  keywords: [
    "indian fno indices",
    "nifty banknifty finnifty lot size",
    "nse bse index options list",
  ],
  alternates: { canonical: "/learn/indices" },
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
          Every major index options contract traded on NSE and BSE — DeltaK reads and trades NIFTY,
          BANKNIFTY and FINNIFTY live; the rest are covered here for reference.
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
                <th className="px-4 py-2.5 text-right font-medium">DeltaK</th>
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
          rules — figures for NIFTY, BANKNIFTY and FINNIFTY come straight from DeltaK&apos;s own live engine
          configuration; the rest link through to the exchange&apos;s current contract note.
        </p>
      </section>
    </LearnChrome>
  );
}
