#!/usr/bin/env python3
"""
Converts export_curves.py's JSON output (equity_curves.json,
fold_comparison.json) plus export_trades.py's manifest.json into the
TypeScript constant web/lib/content/backtestTierCharts.ts imports — the
combined multi-tier equity/drawdown charts and win-rate matrices on
/learn/backtest read straight off this generated file rather than fetching
JSON at request time, same as every other number on that page.

Run after export_curves.py (needs its two JSON files) and
export_trades.py (needs manifest.json) have both already run against a
built index_cache.pkl.
"""
import json

curves = json.load(open("exports/equity_curves.json"))
folds = json.load(open("exports/fold_comparison.json"))
manifest = json.load(open("exports/manifest.json"))

colors = {"100000": "#00f0ff", "50000": "#f59e0b", "25000": "#f43f5e"}
order = ["100000", "50000", "25000"]
curve_by_slug = {c["slug"]: c for c in curves}
fold_by_slug = {f["slug"]: f for f in folds}
manifest_by_cap = {str(int(m["starting_capital"])): m for m in manifest}

lines = []
lines.append("/**")
lines.append(" * Normalized equity curves (percent of starting capital, all three tiers")
lines.append(" * start at 100) and fold-level (train/valid/test) stats for the three")
lines.append(" * lib/engine/resetPresets.ts tiers, from backtest/export_curves.py -- same")
lines.append(" * run, same historical data as BACKTEST_TIERS in ./backtestTiers.ts.")
lines.append(" * Normalized rather than absolute rupees on purpose: the compounded totals")
lines.append(" * are not comparable across tiers, but the curve's SHAPE -- how bumpy, how")
lines.append(" * deep the drawdowns -- is exactly what a normalized overlay makes visible")
lines.append(" * on one axis.")
lines.append(" */")
lines.append("")
lines.append("export type TierEquityCurve = {")
lines.append('  slug: "100000" | "50000" | "25000";')
lines.append("  label: string;")
lines.append("  color: string;")
lines.append("  /** [date, % of starting capital] */")
lines.append("  points: [string, number][];")
lines.append("};")
lines.append("")
lines.append("export const TIER_EQUITY_CURVES: TierEquityCurve[] = [")
for slug in order:
    c = curve_by_slug[slug]
    pts = ",".join('["%s",%s]' % (d, v) for d, v in c["points"])
    lines.append('  { slug: "%s", label: "%s", color: "%s", points: [%s] },' % (slug, c["label"], colors[slug], pts))
lines.append("];")
lines.append("")
lines.append("export type TierFold = { label: string; n: number; winRate: number };")
lines.append('export type TierFoldRow = { slug: "100000" | "50000" | "25000"; label: string; folds: TierFold[] };')
lines.append("")
lines.append("export const TIER_FOLD_COMPARISON: TierFoldRow[] = [")
for slug in order:
    fr = fold_by_slug[slug]
    items = ", ".join('{ label: "%s", n: %d, winRate: %s }' % (x["label"], x["n"], x["win_rate"]) for x in fr["folds"])
    lines.append('  { slug: "%s", label: "%s", folds: [%s] },' % (slug, fr["label"], items))
lines.append("];")
lines.append("")
lines.append("export type TierBreakdownRow = { label: string; trades: number; winRate: number };")
lines.append(
    'export type TierBreakdown = { slug: "100000" | "50000" | "25000"; label: string; '
    "byProtocol: TierBreakdownRow[]; byExitReason: TierBreakdownRow[] };"
)
lines.append("")
lines.append("export const TIER_BREAKDOWNS: TierBreakdown[] = [")
for slug in order:
    m = manifest_by_cap[slug]
    label = " ".join(m["label"].split(" ")[:2])
    proto = ", ".join('{ label: "%s", trades: %d, winRate: %s }' % (x["protocol"], x["trades"], x["win_rate"]) for x in m["by_protocol"])
    exitr = ", ".join('{ label: "%s", trades: %d, winRate: %s }' % (x["action"], x["trades"], x["win_rate"]) for x in m["by_exit_reason"])
    lines.append('  { slug: "%s", label: "%s", byProtocol: [%s], byExitReason: [%s] },' % (slug, label, proto, exitr))
lines.append("];")

out = "\n".join(lines)
with open("../web/lib/content/backtestTierCharts.ts", "w") as f:
    f.write(out + "\n")
print("wrote backtestTierCharts.ts,", len(out), "chars")
