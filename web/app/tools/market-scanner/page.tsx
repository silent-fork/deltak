import type { Metadata } from "next";

import { MarketScannerDashboard } from "@/components/tools/market-scanner/MarketScannerDashboard";
import { ToolPageShell } from "@/components/tools/ToolPageShell";

/**
 * Public, no-login market scanner — a sector heatmap and a range radar,
 * both off NSE's own bulk bhavcopy (see `lib/tools/marketScanner.ts`).
 * Never touches Angel One. Lives under `/tools/`, listed on the `/tools`
 * hub alongside the sector-rotation dashboard.
 */
export const metadata: Metadata = {
  title: "Market Scanner — NSE Sector Heatmap & Range Radar",
  description:
    "A free NSE market scanner — a sector heatmap sized by turnover and coloured by today's " +
    "move, plus a range radar showing which F&O-eligible stocks are nearest their ~20-session " +
    "high or low. Built on NSE's own public bhavcopy data.",
  alternates: {
    canonical: "/tools/market-scanner",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const dynamic = "force-dynamic";

export default function MarketScannerPage() {
  return (
    <ToolPageShell title="Market Scanner" navLocation="market-scanner-nav" viewEvent="tools_market_scanner_view">
      <MarketScannerDashboard />
    </ToolPageShell>
  );
}
