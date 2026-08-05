import { GLOSSARY } from "@/lib/content/glossary";
import { INDICES } from "@/lib/content/indices";
import { STRATEGIES } from "@/lib/content/strategies";
import { TRADING_STYLES } from "@/lib/content/tradingStyles";

const SITE_URL =
  process.env.NEXT_PUBLIC_DK_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "http://localhost:3000");

/**
 * llms-full.txt — llmstxt.org's companion to llms.txt: the same site, at
 * the greater depth llms.txt deliberately stays too short for. Generated
 * from the same `lib/content/*` arrays the real /learn pages render from
 * (strategy names, glossary count, trading styles, indices), so this list
 * can't drift out of sync with the site the way a hand-maintained copy
 * eventually would.
 */
function content(): string {
  const strategyList = STRATEGIES.map((s) => `  - [${s.name}](${SITE_URL}/learn/strategies/${s.slug})`).join(
    "\n",
  );
  const styleList = TRADING_STYLES.map(
    (s) => `  - [${s.name}](${SITE_URL}/learn/trading-styles/${s.slug})`,
  ).join("\n");
  const indexList = INDICES.map((i) => `  - [${i.name}](${SITE_URL}/learn/indices/${i.slug})`).join("\n");

  return `# Quantum Horizon — full reference

> The expanded companion to [/llms.txt](${SITE_URL}/llms.txt). Quantum Horizon is two independent things: a live, multi-broker options-trading terminal (Angel One and Dhan today, more brokers planned) running the DeltaK Matrix Strategy (DKMS, sign-in required), and a family of free NSE F&O reference tools.

## The terminal — DeltaK Matrix Strategy (DKMS)

The terminal reads two structures live, tick by tick, across NIFTY, BANKNIFTY, FINNIFTY, SENSEX and BANKEX options:

- **COA Matrix** — Aegis (the live support wall) and Zenith (the live resistance wall), tracked as two generations each: the cumulative open-interest wall built up over the session, and the one today's writers are actively building right now. A wall "migrating" — its strike shifting session over session — versus "solid" — holding its strike — is what actually selects the protocol below, not a setting anyone chooses.
- **Quantum Horizon** — a live ITM/OTM open-interest profile drawn through the option chain at spot: everything left of it is in-the-money for calls, everything right in-the-money for puts, updated tick by tick.
- **RRG (Relative Rotation Graph)** — relative-strength rotation of strikes against the index spot, plotted into four quadrants: Leading, Improving, Weakening, Lagging. A Lagging read is high-decay and forbidden outright as a candidate, regardless of protocol.

One of four protocols is armed each session, decided by how Aegis and Zenith are migrating:

- **Alpha — Equilibrium Range**: both walls solid. Buys the 2nd ITM Call at Aegis, the 2nd ITM Put at Zenith. Engages only inside the invalidation band around a wall.
- **Beta — Ascension Vector**: support solid, resistance migrating up. ITM Calls on a downward micro-dip only; Put purchases are structurally banned.
- **Gamma — Cascade Vector**: resistance solid, support migrating down. ITM Puts on the cascade only; Calls are structurally banned.
- **Delta — Volatility Trap**: both bounds migrating at once. No candidate clears the Zero-OTM/RRG gate; the engine mutes itself by design rather than force a trade.

Every candidate, in any protocol, still has to clear the Zero-OTM rule (longs restricted to the 2nd/3rd deepest ITM strike — never at-the-money or out-of-the-money) before it's actionable. Execution is either manual (operator clicks Execute) or Autopilot (the engine fires it itself); everything runs in Paper mode against live market data, no live order is ever placed.

[Terminal](${SITE_URL}/terminal) — requires a broker sign-in, Angel One or Dhan (client code/ID, PIN, TOTP); intentionally not indexed, since a sign-in gate has no content of its own to describe.

## Tools — the /tools family

Four free reference dashboards at [/tools](${SITE_URL}/tools), independent of the terminal above and none of them place or arm a trade.

### [F&O Sector Rotation](${SITE_URL}/tools/fno-sector-rotation)

A Relative Rotation Graph across every NSE sector index (Auto, Bank, IT, Pharma, FMCG, Metal, Energy, Realty, PSU Bank and more) plotted against the Nifty 50 as benchmark, one point per trading session. A sector leaderboard ranks every sector by RS-Ratio, and a top-picks panel surfaces the three highest-momentum F&O-eligible stocks inside each currently-Leading sector, so a cash-market-only name never appears.

### [Market Scanner](${SITE_URL}/tools/market-scanner)

A sector heatmap: every sector's constituent stocks as tiles, sized by the sector's aggregate turnover and coloured by that stock's own day change%. Paired with a Range Radar showing which F&O stocks are nearest either edge of their own rolling ~20-session high/low.

### [Volatility Desk](${SITE_URL}/tools/volatility-desk)

An OI-buildup compass: every F&O stock's near-month future, plotted by price-change% against OI-change% into the classic four quadrants — Long Buildup, Short Buildup, Long Unwinding, Short Covering. Alongside it, a max-pain "skyline" and PCR (put/call ratio) for NIFTY, BANKNIFTY and FINNIFTY, and an India VIX regime tracker (Calm/Normal/Elevated/Panic) that explicitly cross-references the terminal's own Protocol Delta volatility-trap language when VIX is elevated.

### [Corporate Calendar](${SITE_URL}/tools/corporate-calendar)

A 7-day forward-looking event strip: results, corporate actions (dividends, splits, bonuses), and IPO open/close dates — F&O-eligible names flagged throughout. Below it, today's block deals and a recent-IPO listing scoreboard (issue price band and listing date).

## Learn — the Quantum Horizon Wiki

[/learn](${SITE_URL}/learn): static reference content, no live data.

### Strategies (${STRATEGIES.length})

${strategyList}

### Glossary (${GLOSSARY.length} terms)

Strikes, the Greeks, margin and settlement rules, OI reading — plus DeltaK's own Aegis, Zenith, Quantum Horizon, COA Matrix and DKMS protocol terms, defined in full at [/learn/glossary](${SITE_URL}/learn/glossary).

### Trading styles

${styleList}

### Indices

${indexList}

## Notes

Paper mode only in the terminal — every fill is simulated against live market data, no live order is ever placed. The /tools pages are read-only reference dashboards built on NSE's own public data, not a trading interface, and not a live real-time feed (most figures are end-of-day bhavcopy based, refreshed on the cadence each tool states). Nothing on this site is investment advice; options trading carries substantial risk of loss.
`;
}

export function GET() {
  return new Response(content(), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
    },
  });
}
