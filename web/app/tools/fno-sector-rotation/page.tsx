import type { Metadata } from "next";

import { SectorDashboard } from "@/components/fno/SectorDashboard";
import { ToolPageShell } from "@/components/tools/ToolPageShell";

const SITE_URL =
  process.env.NEXT_PUBLIC_DK_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/**
 * Public F&O sector-rotation dashboard — no broker sign-in required, and
 * deliberately never touches Angel One (see `lib/sectors/*`, all sourced
 * from NSE's own bhavcopy/constituent data via `nse-bse-api` and
 * niftyindices.com). Unlike `/terminal`, this route *is* indexed: there is
 * real, unique content behind it without any gate.
 *
 * Lives under `/tools/` — the first of the free, no-login market-data
 * utilities listed on the `/tools` hub.
 */
export const metadata: Metadata = {
  title: "NSE F&O Sector Rotation & RRG Dashboard",
  description:
    "Free NSE F&O sector rotation dashboard — live RRG vs Nifty 50, a sector " +
    "leaderboard, and top F&O stock picks from leading sectors.",
  keywords: [
    "nse sector rotation",
    "relative rotation graph india",
    "rrg nifty sectors",
    "fno sector leaderboard",
    "top performing nse sectors today",
    "sector rotation graph nse",
  ],
  alternates: {
    canonical: "/tools/fno-sector-rotation",
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
  name: "NSE F&O Sector Rotation & RRG Dashboard",
  description: metadata.description,
  url: `${SITE_URL}/tools/fno-sector-rotation`,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
};

export default function FnoRotationPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ToolPageShell title="F&O Sector Rotation" navLocation="fno-nav" viewEvent="tools_fno_sector_rotation_view">
        <SectorDashboard />
      </ToolPageShell>
    </>
  );
}
