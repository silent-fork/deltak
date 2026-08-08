/**
 * The same shipped strategy (limit entry 12% + thesis-exit) run at the
 * three `lib/engine/resetPresets.ts` starting-balance/riskPct pairings,
 * against the identical historical data as the flagship Rs 1,00,000/6%
 * report above — see `backtest/backtest_tiers.py`. The Rs 1,00,000 tier's
 * numbers here reproduce `KPIS`/`INDEX_ATTRIBUTION` in `./backtest.ts`
 * exactly (692 trades, 71.8% win rate, Sharpe 6.06, -11.2% max DD) — same
 * run, same data, just re-cut per tier — so the two are directly
 * comparable rather than a separate, unrelated study.
 *
 * Sharpe/max-drawdown come from the daily equity curve (every trading day
 * marked, not just days a trade closed) — see `backtest/sharpe_report.py`'s
 * methodology, which `backtest_tiers.py` reuses directly.
 */

export type BacktestTier = {
  slug: "100000" | "50000" | "25000";
  capitalLabel: string;
  capital: number;
  riskPct: number;
  trades: number;
  winRate: number;
  sharpe: number;
  maxDD: number;
  byIndex: { label: string; trades: number; winRate: number; net: number }[];
};

export const BACKTEST_TIERS: BacktestTier[] = [
  {
    slug: "25000",
    capitalLabel: "₹25,000",
    capital: 25_000,
    riskPct: 60,
    trades: 672,
    winRate: 71.3,
    sharpe: 4.69,
    maxDD: -27.9,
    byIndex: [
      { label: "NIFTY", trades: 270, winRate: 75.2, net: 4_301_141 },
      { label: "SENSEX", trades: 218, winRate: 67.9, net: 2_462_225 },
      { label: "FINNIFTY", trades: 55, winRate: 76.4, net: 551_993 },
      { label: "BANKNIFTY", trades: 43, winRate: 72.1, net: 463_629 },
      { label: "BANKEX", trades: 86, winRate: 64.0, net: 577_550 },
    ],
  },
  {
    slug: "50000",
    capitalLabel: "₹50,000",
    capital: 50_000,
    riskPct: 30,
    trades: 676,
    winRate: 71.4,
    sharpe: 4.72,
    maxDD: -27.9,
    byIndex: [
      { label: "NIFTY", trades: 273, winRate: 75.5, net: 8_898_272 },
      { label: "SENSEX", trades: 218, winRate: 67.9, net: 5_030_279 },
      { label: "FINNIFTY", trades: 55, winRate: 76.4, net: 1_118_349 },
      { label: "BANKNIFTY", trades: 45, winRate: 73.3, net: 1_066_368 },
      { label: "BANKEX", trades: 85, winRate: 63.5, net: 1_127_253 },
    ],
  },
  {
    slug: "100000",
    capitalLabel: "₹1,00,000",
    capital: 100_000,
    riskPct: 6,
    trades: 692,
    winRate: 71.8,
    sharpe: 6.06,
    maxDD: -11.2,
    byIndex: [
      { label: "NIFTY", trades: 282, winRate: 75.9, net: 5_328_800 },
      { label: "SENSEX", trades: 221, winRate: 67.9, net: 3_157_811 },
      { label: "FINNIFTY", trades: 58, winRate: 77.6, net: 809_683 },
      { label: "BANKNIFTY", trades: 45, winRate: 73.3, net: 686_778 },
      { label: "BANKEX", trades: 86, winRate: 64.0, net: 663_524 },
    ],
  },
];
