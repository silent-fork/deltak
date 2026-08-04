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
  title: "Corporate Calendar — F&O Results & IPO Tracker",
  description:
    "Free NSE corporate calendar — results, corporate actions and IPO milestones " +
    "this week, plus today's block deals and recent listings.",
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
    <ToolPageShell title="Corporate Calendar" navLocation="corporate-calendar-nav" viewEvent="tools_corporate_calendar_view">
      <CorporateCalendarDashboard />
    </ToolPageShell>
  );
}
