import type { Metadata } from "next";

import { MarketScannerDashboard } from "@/components/tools/market-scanner/MarketScannerDashboard";
import { ToolPageShell } from "@/components/tools/ToolPageShell";

const SITE_URL =
  process.env.NEXT_PUBLIC_DK_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

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
  keywords: [
    "nse sector heatmap",
    "fno stock scanner india",
    "nse stocks near 52 week high low",
    "range radar nse stocks",
    "sector heatmap live nse",
  ],
  alternates: {
    canonical: "/tools/market-scanner",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const dynamic = "force-dynamic";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Market Scanner — NSE Sector Heatmap & Range Radar",
  description: metadata.description,
  url: `${SITE_URL}/tools/market-scanner`,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
};

export default function MarketScannerPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ToolPageShell title="Market Scanner" navLocation="market-scanner-nav" viewEvent="tools_market_scanner_view">
        <MarketScannerDashboard />
      </ToolPageShell>
    </>
  );
}
