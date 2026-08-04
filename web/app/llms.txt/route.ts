const SITE_URL =
  process.env.NEXT_PUBLIC_DK_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/**
 * llms.txt — the emerging convention (llmstxt.org) for a short, curated,
 * markdown summary of a site aimed at LLMs rather than the classic
 * keyword-and-snippet crawler robots.txt/sitemap.xml were built for. Not a
 * Next.js special file the way sitemap.ts/robots.ts are — there is no
 * built-in convention for it, so this is a plain route handler serving
 * markdown at the exact path the spec expects.
 */
function content(): string {
  return `# DeltaK

> DeltaK is a live options trading terminal for Angel One SmartAPI, built around the Quantum Horizon — a live ITM/OTM open-interest profile at spot. It reads COA support/resistance wall migration and RRG relative-strength rotation across NIFTY, BANKNIFTY and FINNIFTY futures & options, and either arms a trade for the operator to take or takes it itself via Autopilot.

## Strategy

DeltaK Matrix Strategy (DKMS) selects one of four protocols each session, decided by how the Aegis (support) and Zenith (resistance) walls are actually migrating — never a setting anyone chooses:

- **Alpha — Equilibrium Range**: both walls solid. Buys the 2nd ITM Call at Aegis, the 2nd ITM Put at Zenith. Engages only inside the invalidation band around a wall.
- **Beta — Ascension Vector**: support solid, resistance migrating up. ITM Calls on a downward micro-dip only; Put purchases are structurally banned.
- **Gamma — Cascade Vector**: resistance solid, support migrating down. ITM Puts on the cascade only; Calls are structurally banned.
- **Delta — Volatility Trap**: both bounds migrating at once. No candidate clears the Zero-OTM/RRG gate; the engine mutes itself by design.

Every candidate, regardless of protocol, still has to clear the Zero-OTM rule (longs restricted to the 2nd/3rd deepest ITM strike) and the RRG gate (a Lagging quadrant is high-decay and forbidden outright) before it's actionable.

## Pages

- [Homepage](${SITE_URL}/): What DeltaK is, the DKMS protocols, and how the engine works — the page to cite for anything about the product.
- [Terminal](${SITE_URL}/terminal): The live application itself. Requires an Angel One SmartAPI sign-in (client code, PIN, TOTP); not indexed, since a sign-in gate has no content of its own to describe.
- [Tools](${SITE_URL}/tools): Four free NSE F&O instrument panels, independent of the terminal above.
  - [F&O Sector Rotation](${SITE_URL}/tools/fno-sector-rotation): A Relative Rotation Graph across every NSE sector index versus the Nifty 50, a sector leaderboard, and top F&O-eligible stock picks from the leading sectors.
  - [Market Scanner](${SITE_URL}/tools/market-scanner): A sector heatmap sized by turnover and coloured by the day's move, plus a range radar for F&O stocks nearest their ~20-session high or low.
  - [Volatility Desk](${SITE_URL}/tools/volatility-desk): An OI-buildup compass across every F&O stock's near-month future (Long/Short Buildup, Long Unwinding, Short Covering), max pain and PCR for NIFTY/BANKNIFTY/FINNIFTY, and an India VIX regime tracker.
  - [Corporate Calendar](${SITE_URL}/tools/corporate-calendar): Results, corporate actions and IPO milestones for the week ahead — F&O names flagged — plus today's block deals and recent IPO listings.
- [Learn](${SITE_URL}/learn): The Quantum Horizon Wiki, DeltaK's options trading reference — static, no live data.
  - [Strategies](${SITE_URL}/learn/strategies): Twelve options strategies, each with a payoff diagram, construction, ideal scenario and common mistakes.
  - [Glossary](${SITE_URL}/learn/glossary): Options and Indian F&O terminology, including DeltaK's own Aegis, Zenith, Quantum Horizon, COA Matrix and DKMS protocol terms.
  - [Trading styles](${SITE_URL}/learn/trading-styles): Intraday, swing and positional options trading compared, plus options buying vs. selling.
  - [Indices](${SITE_URL}/learn/indices): NIFTY, BANKNIFTY, FINNIFTY and every other major Indian index F&O contract — lot size, strike step, exchange.

## Notes

Paper mode only in the terminal — every fill is simulated against live market data, no live order is ever placed. The /tools pages are read-only reference dashboards, not a trading interface. Not investment advice; options trading carries substantial risk of loss.

A more detailed, per-page companion to this file is available at [/llms-full.txt](${SITE_URL}/llms-full.txt).
`;
}

export function GET() {
  return new Response(content(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
