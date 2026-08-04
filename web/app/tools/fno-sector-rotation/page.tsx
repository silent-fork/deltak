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
  title: "NSE F&O Sector Rotation & RRG Dashboard",
  description:
    "Free NSE F&O sector rotation dashboard — live RRG vs Nifty 50, a sector " +
    "leaderboard, and top F&O stock picks from leading sectors.",
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
    <ToolPageShell title="F&O Sector Rotation" navLocation="fno-nav" viewEvent="tools_fno_sector_rotation_view">
      <SectorDashboard />
    </ToolPageShell>
  );
}
