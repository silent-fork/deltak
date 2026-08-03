import type { Metadata } from "next";

import { SectorDashboard } from "@/components/fno/SectorDashboard";
import { ToolPageShell } from "@/components/tools/ToolPageShell";

/**
 * Public F&O sector-rotation dashboard — no DeltaK login required, and
 * deliberately never touches Angel One (see `lib/sectors/*`, all sourced
 * from NSE's own bhavcopy/constituent data via `nse-bse-api` and
 * niftyindices.com). Unlike `/terminal`, this route *is* indexed: there is
 * real, unique content behind it without any gate.
 *
 * Lives under `/tools/` — the first of the free, no-login market-data
 * utilities listed on the `/tools` hub.
 */
export const metadata: Metadata = {
  title: "F&O Sector Rotation Dashboard — NSE Sector RRG & Top F&O Stock Picks",
  description:
    "A free NSE F&O sector rotation dashboard — a live Relative Rotation Graph " +
    "(RRG) across every NSE sector index versus the Nifty 50, a sector leaderboard, and " +
    "top F&O-eligible stock picks from the leading sectors. Built on NSE's own public " +
    "bhavcopy and constituent data.",
  alternates: {
    canonical: "/tools/fno-sector-rotation",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const dynamic = "force-dynamic";

export default function FnoRotationPage() {
  return (
    <ToolPageShell title="F&O Sector Rotation" navLocation="fno-nav">
      <SectorDashboard />
    </ToolPageShell>
  );
}
