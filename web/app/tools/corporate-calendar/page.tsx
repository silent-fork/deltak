import type { Metadata } from "next";

import { CorporateCalendarDashboard } from "@/components/tools/corporate-calendar/CorporateCalendarDashboard";
import { ToolPageShell } from "@/components/tools/ToolPageShell";

/**
 * Public, no-login corporate calendar — upcoming results (via board
 * meetings), corporate actions and IPO milestones, plus today's block
 * deals and recent IPO listings (see `lib/tools/corporateCalendar.ts`,
 * `blockDeals.ts`). Never touches Angel One.
 */
export const metadata: Metadata = {
  title: "Corporate Calendar — F&O Results, Actions & IPO Tracker",
  description:
    "A free NSE corporate calendar — upcoming results, dividends/splits/bonuses and IPO " +
    "milestones for the week ahead, F&O-eligible names flagged, plus today's block deals and " +
    "recent IPO listings. Built on NSE's own public corporate and IPO data.",
  alternates: {
    canonical: "/tools/corporate-calendar",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const dynamic = "force-dynamic";

export default function CorporateCalendarPage() {
  return (
    <ToolPageShell title="Corporate Calendar" navLocation="corporate-calendar-nav">
      <CorporateCalendarDashboard />
    </ToolPageShell>
  );
}
