"use client";

import { Download, FileJson, FileSpreadsheet, Printer } from "lucide-react";

import { track } from "@/lib/analytics";

/**
 * Real downloads, not decorative ones — every file here is generated on
 * request by /api/backtest/download from the same trade data behind the
 * report and the tier comparison above it (`backtest/export_trades.py`),
 * not a fabricated sample and not a pre-baked static file: the trade
 * ledgers are the actual 672-692 trades each tier took, with the same
 * protocol (entry reason) and exit-reason fields the attribution tables
 * on this page are built from, formatted to CSV/JSON when the request
 * lands rather than shipped as files under public/.
 */
const FILES = [
  {
    href: "/api/backtest/download?file=ledger-100000",
    icon: FileSpreadsheet,
    title: "Trade ledger — ₹1,00,000 tier",
    body: "Every trade: date, index, protocol, strike, entry/exit price, exit reason, charges, net P&L.",
    size: "692 trades · CSV",
  },
  {
    href: "/api/backtest/download?file=ledger-50000",
    icon: FileSpreadsheet,
    title: "Trade ledger — ₹50,000 tier",
    body: "Same fields, the ₹50,000 / 30% risk tier's own trades.",
    size: "676 trades · CSV",
  },
  {
    href: "/api/backtest/download?file=ledger-25000",
    icon: FileSpreadsheet,
    title: "Trade ledger — ₹25,000 tier",
    body: "Same fields, the ₹25,000 / 60% risk tier's own trades.",
    size: "672 trades · CSV",
  },
  {
    href: "/api/backtest/download?file=attribution-summary",
    icon: FileSpreadsheet,
    title: "Attribution summary, all tiers",
    body: "By-index, by-protocol and by-exit-reason rollups for all three tiers in one sheet.",
    size: "CSV",
  },
  {
    href: "/api/backtest/download?file=full-export",
    icon: FileJson,
    title: "Full export, all tiers",
    body: "Every trade plus its tier's summary stats, structured — for anyone re-processing the data themselves.",
    size: "JSON",
  },
];

export function BacktestDownloads() {
  return (
    <div className="print:hidden">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {FILES.map((f) => (
          <a
            key={f.href}
            href={f.href}
            download
            onClick={() => track("backtest_download", { file: f.href })}
            className="dk-panel group flex gap-3 rounded-lg p-3.5 transition-colors hover:border-quantum/40"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-500 transition-colors group-hover:border-quantum/40 group-hover:text-quantum">
              <f.icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h4 className="truncate text-[12px] font-semibold text-zinc-100">{f.title}</h4>
                <Download className="h-3.5 w-3.5 shrink-0 text-zinc-600 transition-colors group-hover:text-quantum" />
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{f.body}</p>
              <p className="mt-1.5 font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">{f.size}</p>
            </div>
          </a>
        ))}

        <button
          type="button"
          onClick={() => {
            track("backtest_download", { file: "print" });
            window.print();
          }}
          className="dk-panel group flex gap-3 rounded-lg p-3.5 text-left transition-colors hover:border-quantum/40"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900/60 text-zinc-500 transition-colors group-hover:border-quantum/40 group-hover:text-quantum">
            <Printer className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h4 className="truncate text-[12px] font-semibold text-zinc-100">Download full report as PDF</h4>
              <Download className="h-3.5 w-3.5 shrink-0 text-zinc-600 transition-colors group-hover:text-quantum" />
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
              Opens your browser&apos;s print dialog on this whole page — choose &quot;Save as PDF&quot; as the
              destination.
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
