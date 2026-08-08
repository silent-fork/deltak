"use client";

import { useState } from "react";

import { LabeledBar, fmtCompactINR } from "@/components/BacktestCharts";
import { BACKTEST_TIERS } from "@/lib/content/backtestTiers";
import { cn } from "@/lib/utils";

/**
 * The three `lib/engine/resetPresets.ts` starting-balance tiers, switched
 * in place rather than three stacked copies of the same chart — a reader
 * comparing them wants "how does this number change," which a toggle
 * answers directly and three parallel panels make them scan for.
 *
 * Defaults to Rs 1,00,000 — the same tier the report above it is entirely
 * about — so switching to a smaller balance reads as "what if," not as
 * the page's own headline number changing under you.
 */
export function BacktestTierComparison() {
  const [active, setActive] = useState(() => BACKTEST_TIERS.findIndex((t) => t.slug === "100000"));
  const tier = BACKTEST_TIERS[active];
  const indexMax = Math.max(...tier.byIndex.map((i) => i.net));

  const kpis = [
    { label: "Sharpe", value: tier.sharpe.toFixed(2), tone: tier.sharpe >= 5.5 ? "good" : "neutral" as const },
    { label: "Max drawdown", value: `${tier.maxDD.toFixed(1)}%`, tone: "bad" as const },
    { label: "Win rate", value: `${tier.winRate.toFixed(1)}%`, tone: "neutral" as const },
    { label: "Trades", value: String(tier.trades), tone: "neutral" as const },
  ];

  return (
    <div className="dk-panel rounded-lg p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[13px] font-semibold text-zinc-100">Same signals, different starting balance</h3>
        <div className="flex gap-1.5" role="tablist" aria-label="Starting balance">
          {BACKTEST_TIERS.map((t, i) => (
            <button
              key={t.slug}
              type="button"
              role="tab"
              aria-selected={active === i}
              onClick={() => setActive(i)}
              className={cn(
                "rounded-md border px-2.5 py-1 font-mono text-[10.5px] font-semibold transition-colors",
                active === i
                  ? "border-quantum/50 bg-quantum/10 text-quantum"
                  : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700",
              )}
            >
              {t.capitalLabel}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-zinc-500">
        {tier.riskPct}% risk per trade — the paper-wallet reset preset paired with this balance, run through the
        identical strategy and historical data as the report above. Position <em>size</em> changes with riskPct;
        which signals fire does not, which is why trade counts sit within a few percent of each other across
        every tier.
      </p>

      <div className="mt-3.5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-zinc-800 bg-zinc-800 sm:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="flex flex-col gap-1 bg-zinc-950 p-3">
            <span className="font-mono text-[9px] uppercase tracking-wider text-zinc-500">{k.label}</span>
            <span
              className={cn(
                "font-mono text-[16px] font-semibold tabular-nums",
                k.tone === "good" ? "text-emerald-400" : k.tone === "bad" ? "text-rose-400" : "text-zinc-100",
              )}
            >
              {k.value}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-2.5 border-t border-zinc-800 pt-3.5">
        {tier.byIndex.map((i) => (
          <LabeledBar
            key={i.label}
            label={i.label}
            value={i.net}
            max={indexMax}
            color="#00f0ff"
            valueLabel={fmtCompactINR(i.net)}
          />
        ))}
      </div>

      <p className="mt-4 border-t border-zinc-800 pt-3 text-[10.5px] leading-relaxed text-zinc-600">
        Sharpe drops and drawdown roughly doubles moving from Rs 1,00,000 to the smaller tiers — the cost of the
        higher riskPct a smaller float needs to clear the same per-index 1-lot floors. The raw P&amp;L totals
        aren&apos;t shown here on purpose: fixed-fractional sizing compounded across ~680 trades produces numbers
        in the crores that are a property of the sizing formula, not a real-market outcome — Sharpe, drawdown and
        win rate are what actually compare across tiers.
      </p>
    </div>
  );
}
