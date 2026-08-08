#!/usr/bin/env python3
"""
Equity curves and fold-level (train/valid/test) stats for all three
`lib/engine/resetPresets.ts` tiers — the piece `export_trades.py` didn't
capture (it only dumped trade-level records). Feeds the report page's
combined multi-tier equity/drawdown charts and fold-comparison table.

Equity is exported normalized (% of starting capital, all three tiers
start at 100) rather than absolute rupees — the raw compounded totals
aren't comparable across tiers (see backtest_tiers.py's own P&L caveat),
but the SHAPE of the curve (how bumpy, how deep the drawdowns) is exactly
what's comparable, and normalizing is what makes that visible on one axis.
"""
import json
import os

import backtest_pnl_v2 as B
import framework as F
import optimize as O
import sharpe_report as S

TIERS = [
    ("100000", "₹1,00,000", 100_000.0, 6.0),
    ("50000", "₹50,000", 50_000.0, 30.0),
    ("25000", "₹25,000", 25_000.0, 60.0),
]

OUT_DIR = os.path.join(os.path.dirname(__file__), "exports")
os.makedirs(OUT_DIR, exist_ok=True)


def run_tier(idxs, underlyings, train, valid, test, capital, risk_pct):
    B.CAPITAL0 = capital
    B.RISK_PCT = risk_pct
    cfg = dict(F.DEFAULT_CFG)
    cfg["spread_pct"] = 1.0
    cfg["limit_discount_pct"] = 12.0
    cfg["limit_timeout_bars"] = 3
    cfg["thesis_exit"] = True
    return B.run(idxs, underlyings, cfg, train, valid, test)


def fold_stats(trades, capital, split_days, name):
    sub = [t for t in trades if t["day"] in split_days]
    n = len(sub)
    wins = [t for t in sub if t["net"] > 0]
    pnl = sum(t["net"] for t in sub)
    return {
        "label": name,
        "n": n,
        "win_rate": round(len(wins) / n * 100, 1) if n else 0.0,
        "pnl_pct": round(pnl / capital * 100, 1) if capital else 0.0,
    }


if __name__ == "__main__":
    O.CACHE = os.path.join(O.HERE, "index_cache.pkl")
    idxs = O.build_all()
    train, valid, test, all_days = O.make_splits(idxs)
    underlyings = list(idxs.keys())

    curves = []
    folds = []
    for slug, label, capital, risk_pct in TIERS:
        final_capital, trades, equity_by_day = run_tier(
            idxs, underlyings, train, valid, test, capital, risk_pct,
        )
        days, equity = S.day_end_curve(equity_by_day)
        sharpe, max_dd = S.sharpe_and_drawdown(equity)

        # normalized to 100 at start, one point per marked trading day
        normalized = [round(e / capital * 100, 2) for e in equity]
        day_strs = [d.isoformat() if hasattr(d, "isoformat") else str(d) for d in days]
        curves.append({
            "slug": slug, "label": label,
            "sharpe": round(sharpe, 2), "max_dd": round(max_dd * 100, 1),
            "points": list(zip(day_strs, normalized)),
        })

        folds.append({
            "slug": slug, "label": label,
            "folds": [
                fold_stats(trades, capital, train, "Train"),
                fold_stats(trades, capital, valid, "Validate"),
                fold_stats(trades, capital, test, "Test"),
            ],
        })
        print(f"{label}: {len(days)} marked days, sharpe={sharpe:.2f}, max_dd={max_dd*100:.1f}%")

    with open(os.path.join(OUT_DIR, "equity_curves.json"), "w") as f:
        json.dump(curves, f)
    with open(os.path.join(OUT_DIR, "fold_comparison.json"), "w") as f:
        json.dump(folds, f, indent=2)
    print("wrote equity_curves.json, fold_comparison.json")
