import { TIER_BREAKDOWNS, TIER_FOLD_COMPARISON } from "@/lib/content/backtestTierCharts";

/**
 * Win rate is the fair comparison across starting-balance tiers — net P&L
 * isn't (see `BacktestTierComparison`'s own caveat: fixed-fractional
 * sizing compounded across ~680 trades makes the rupee totals a property
 * of the sizing formula, not something meaningfully different tier to
 * tier). These three tables all transpose the per-tier breakdowns from
 * `backtestTierCharts.ts` into rows-of-category, columns-of-tier, so a
 * reader scans one row to see whether a category holds up the same way
 * regardless of which balance is running it.
 */

type Row = { label: string; cells: { winRate: number; trades: number }[] };

function transpose(
  key: "byProtocol" | "byExitReason",
): { categories: string[]; rows: Row[] } {
  const categories = TIER_BREAKDOWNS[0][key].map((r) => r.label);
  const rows = categories.map((label) => ({
    label,
    cells: TIER_BREAKDOWNS.map((t) => {
      const found = t[key].find((r) => r.label === label);
      return { winRate: found?.winRate ?? 0, trades: found?.trades ?? 0 };
    }),
  }));
  return { categories, rows };
}

function Matrix({ title, rows }: { title: string; rows: Row[] }) {
  return (
    <div className="dk-panel rounded-lg p-4">
      <h4 className="text-[12px] font-semibold text-zinc-100">{title}</h4>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left font-mono text-[9px] uppercase tracking-wider text-zinc-600">
              <th className="pb-2 font-medium"> </th>
              {TIER_BREAKDOWNS.map((t) => (
                <th key={t.slug} className="pb-2 text-right font-medium">{t.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {rows.map((r) => (
              <tr key={r.label} className="border-t border-zinc-900">
                <td className="py-2 font-sans text-[10.5px] font-semibold text-zinc-300">{r.label}</td>
                {r.cells.map((c, i) => (
                  <td key={TIER_BREAKDOWNS[i].slug} className="py-2 text-right leading-tight">
                    <div className={c.winRate >= 70 ? "text-emerald-400" : c.winRate > 0 ? "text-zinc-200" : "text-zinc-600"}>
                      {c.winRate}%
                    </div>
                    <div className="text-[9px] text-zinc-600">n={c.trades}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BacktestTierMatrix() {
  const protocol = transpose("byProtocol");
  const exitReason = transpose("byExitReason");

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <Matrix title="Win rate by protocol, all tiers" rows={protocol.rows} />
      <Matrix title="Win rate by exit reason, all tiers" rows={exitReason.rows} />
    </div>
  );
}

/** Walk-forward fold win rate, same transpose, its own component since the shape (3 folds, not 3-5 categories) differs. */
export function BacktestTierFolds() {
  const foldNames = TIER_FOLD_COMPARISON[0].folds.map((f) => f.label);
  return (
    <div className="dk-panel rounded-lg p-4">
      <h4 className="text-[12px] font-semibold text-zinc-100">Walk-forward win rate, all tiers</h4>
      <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
        Train (oldest 60% of days), Validate (next 20%), Test (final 20%, looked at once) — the same split every
        tier ran through.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[400px] text-[12px]">
          <thead>
            <tr className="text-left font-mono text-[9.5px] uppercase tracking-wider text-zinc-600">
              <th className="pb-2 font-medium"> </th>
              {TIER_FOLD_COMPARISON.map((t) => (
                <th key={t.slug} className="pb-2 text-right font-medium">{t.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono tabular-nums">
            {foldNames.map((name) => (
              <tr key={name} className="border-t border-zinc-900">
                <td className="py-2 font-sans text-[11px] font-semibold text-zinc-300">{name}</td>
                {TIER_FOLD_COMPARISON.map((t) => {
                  const f = t.folds.find((x) => x.label === name);
                  return (
                    <td key={t.slug} className="py-2 text-right">
                      <span className={(f?.winRate ?? 0) >= 70 ? "text-emerald-400" : "text-zinc-200"}>
                        {f?.winRate}%
                      </span>
                      <span className="ml-1.5 text-[9.5px] text-zinc-600">n={f?.n}</span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
