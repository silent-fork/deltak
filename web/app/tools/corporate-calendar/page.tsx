import type { Metadata } from "next";

import { CorporateCalendarDashboard } from "@/components/tools/corporate-calendar/CorporateCalendarDashboard";
import { ToolPageShell } from "@/components/tools/ToolPageShell";

const SITE_URL =
  process.env.NEXT_PUBLIC_DK_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/**
 * Public, no-login corporate calendar — upcoming results (via board
 * meetings), corporate actions and IPO milestones, plus today's block
 * deals and recent IPO listings (see `lib/tools/corporateCalendar.ts`,
 * `blockDeals.ts`). Never touches Angel One.
 */
export const metadata: Metadata = {
  title: "Corporate Calendar — F&O Results & IPO Tracker",
  description:
    "Free NSE corporate calendar — results, corporate actions and IPO milestones " +
    "this week, plus today's block deals and recent listings.",
  keywords: [
    "nse results calendar",
    "fno corporate actions this week",
    "ipo calendar nse bse",
    "block deals today nse",
    "nse ipo listing tracker",
  ],
  alternates: {
    canonical: "/tools/corporate-calendar",
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
  name: "Corporate Calendar — F&O Results & IPO Tracker",
  description: metadata.description,
  url: `${SITE_URL}/tools/corporate-calendar`,
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  offers: { "@type": "Offer", price: "0", priceCurrency: "INR" },
};

export default function CorporateCalendarPage() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <ToolPageShell title="Corporate Calendar" navLocation="corporate-calendar-nav" viewEvent="tools_corporate_calendar_view">
        <CorporateCalendarDashboard />
      </ToolPageShell>
    </>
  );
}
