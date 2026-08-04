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
    "Free NSE market scanner — a turnover-weighted sector heatmap plus a range " +
    "radar for F&O stocks near their 20-session high or low.",
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
