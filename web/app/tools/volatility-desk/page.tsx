import type { Metadata } from "next";

import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { VolatilityDeskDashboard } from "@/components/tools/volatility-desk/VolatilityDeskDashboard";

const SITE_URL =
  process.env.NEXT_PUBLIC_DK_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/**
 * Public, no-login volatility desk — OI buildup, PCR, max pain and India
 * VIX, all off NSE's own public data (see `lib/tools/oiBuildup.ts`,
 * `optionMetrics.ts`, `vix.ts`). Never touches Angel One.
 */
export const metadata: Metadata = {
  title: "Volatility Desk — OI Buildup, Max Pain, PCR & VIX",
  description:
    "Free NSE volatility desk — OI buildup, max pain, PCR for NIFTY, BANKNIFTY, " +
    "FINNIFTY, and an India VIX regime tracker.",
  keywords: [
    "oi buildup nifty banknifty",
    "max pain calculator nifty",
    "pcr nifty banknifty finnifty",
    "india vix regime tracker",
    "open interest analysis nse",
  ],
  alternates: {
    canonical: "/tools/volatility-desk",
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
  name: "Volatility Desk — OI Buildup, Max Pain, PCR & VIX",
  description: metadata.description,
  url: `${SITE_URL}/tools/volatility-desk`,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
};

export default function VolatilityDeskPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ToolPageShell title="Volatility Desk" navLocation="volatility-desk-nav" viewEvent="tools_volatility_desk_view">
        <VolatilityDeskDashboard />
      </ToolPageShell>
    </>
  );
}
