import type { Metadata } from "next";

import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { VolatilityDeskDashboard } from "@/components/tools/volatility-desk/VolatilityDeskDashboard";

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
  alternates: {
    canonical: "/tools/volatility-desk",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export const dynamic = "force-dynamic";

export default function VolatilityDeskPage() {
  return (
    <ToolPageShell title="Volatility Desk" navLocation="volatility-desk-nav" viewEvent="tools_volatility_desk_view">
      <VolatilityDeskDashboard />
    </ToolPageShell>
  );
}
