#!/usr/bin/env python3
"""
Sweep limit_discount_pct (currently shipped at 3.0%) up to 10% to see
whether a deeper limit-entry discount reduces max drawdown — the obvious
hypothesis being a wider discount only fills on a bigger pullback, which
could mean better average entries but also fewer fills overall (missed
trades on strong one-way moves).

Two views, on purpose:

  1. Full-period Rs P&L (Sharpe/max-DD need a continuous daily equity curve,
     so this runs over the whole 18 months, train+valid+test together) —
     real-money color, but choosing a discount by looking at this number
     alone is exactly the kind of in-sample selection the rest of this
     study exists to avoid.

  2. R-space, per walk-forward fold — the honest comparison: the discount
     is "chosen" by TRAIN+VALIDATE expectancy only, then TEST is reported
     once for whatever that choice was, never used to pick. This is the
     same discipline optimize.py/final_stats.py apply everywhere else.

Everything else held at the current shipped config: riskPct=6 (Rs view),
thesis_exit=True, spread_pct=1.0 (modeled friction), limit_timeout_bars=3.
"""
import os
import statistics

import optimize as O
import framework as F
import backtest_pnl_v2 as B
import sharpe_report as S

DISCOUNTS = [3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]


def cfg_for(discount):
    cfg = dict(F.DEFAULT_CFG)
    cfg["spread_pct"] = 1.0
    cfg["limit_discount_pct"] = discount
    cfg["limit_timeout_bars"] = 3
    cfg["thesis_exit"] = True
    return cfg


def run_rs(idxs, underlyings, train, valid, test, discount):
    """Full-period Rs P&L + Sharpe/max-DD — real-money color, not fold-safe."""
    B.RISK_PCT = 6.0
    cfg = cfg_for(discount)
    capital, trades, equity_by_day = B.run(idxs, underlyings, cfg, train, valid, test)
    days, equity = S.day_end_curve(equity_by_day)
    sharpe, max_dd = S.sharpe_and_drawdown(equity)

    wins = [t for t in trades if t["net"] > 0]
    total_net = sum(t["net"] for t in trades)
    # A deeper discount only fills on a bigger pullback -> lower entry
    # premium -> smaller absolute stop distance (stop_pts = entry * stop_pct)
    # -> MORE lots sized for the same fixed-fractional risk budget. Real
    # confound: part of any net-P&L change is fewer, better-quality fills;
    # part is each fill simply being sized larger. Surfaced, not left implicit.
    avg_lots = statistics.mean(t["lots"] for t in trades) if trades else 0
    avg_entry = statistics.mean(t["entry"] for t in trades) if trades else 0

    return {
        "discount": discount, "trades": len(trades),
        "win_rate": len(wins) / len(trades) * 100 if trades else 0,
        "total_net": total_net, "final_capital": capital, "sharpe": sharpe,
        "max_dd": max_dd * 100 if max_dd is not None else None,
        "avg_lots": avg_lots, "avg_entry": avg_entry,
    }


def run_r_space(idxs, train, valid, test, discount):
    """R-multiple expectancy per fold — the walk-forward-safe view."""
    cfg = cfg_for(discount)
    m, _ = O.run_cfg(idxs, cfg, train, valid, test)
    return {"discount": discount, "train": m["train"], "valid": m["valid"], "test": m["test"]}


def main():
    O.CACHE = os.path.join(O.HERE, "index_cache.pkl")
    idxs = O.build_all()
    train, valid, test, all_days = O.make_splits(idxs)
    underlyings = list(idxs.keys())

    print("=== full-period Rs P&L (exploratory — not fold-restricted) ===")
    print(f"{'discount':>9} {'trades':>7} {'win%':>6} {'sharpe':>7} {'maxDD':>8} {'net':>14} {'avgLots':>8} {'avgEntry':>9}")
    rs_results = []
    for d in DISCOUNTS:
        r = run_rs(idxs, underlyings, train, valid, test, d)
        rs_results.append(r)
        print(f"{r['discount']:8.1f}% {r['trades']:7d} {r['win_rate']:5.1f}% "
              f"{r['sharpe']:7.2f} {r['max_dd']:7.1f}% {r['total_net']:+14,.0f} "
              f"{r['avg_lots']:8.2f} {r['avg_entry']:9.2f}")

    print("\n=== R-space, per walk-forward fold (the fold-safe view) ===")
    print(f"{'discount':>9} {'TRAIN exp':>10} {'n':>5} {'VALID exp':>10} {'n':>5} {'TEST exp':>10} {'n':>5} {'TEST wr':>8} {'TEST pf':>8}")
    r_results = []
    for d in DISCOUNTS:
        r = run_r_space(idxs, train, valid, test, d)
        r_results.append(r)
        tr = r["train"]["expectancy_r"] if r["train"]["n"] else float("nan")
        va = r["valid"]["expectancy_r"] if r["valid"]["n"] else float("nan")
        te = r["test"]["expectancy_r"] if r["test"]["n"] else float("nan")
        te_wr = r["test"]["win_rate"] if r["test"]["n"] else float("nan")
        te_pf = r["test"]["profit_factor"] if r["test"]["n"] else float("nan")
        print(f"{r['discount']:8.1f}% {tr:+10.3f} {r['train']['n']:5d} {va:+10.3f} {r['valid']['n']:5d} "
              f"{te:+10.3f} {r['test']['n']:5d} {te_wr:7.1f}% {te_pf:8.2f}")

    # Walk-forward-honest selection: pick the discount that maximises
    # TRAIN+VALIDATE expectancy — TEST is never looked at to choose, only
    # reported once for whatever that choice turns out to be.
    def select_score(r):
        tr_n, va_n = r["train"]["n"], r["valid"]["n"]
        if not tr_n or not va_n:
            return float("-inf")
        combined_r = r["train"]["total_r"] + r["valid"]["total_r"]
        combined_n = tr_n + va_n
        return combined_r / combined_n

    chosen = max(r_results, key=select_score)
    chosen_rs = next(x for x in rs_results if x["discount"] == chosen["discount"])
    print(f"\nchosen by TRAIN+VALIDATE expectancy: {chosen['discount']:.1f}% "
          f"(combined exp {select_score(chosen):+.3f}R)")
    print(f"  TEST fold confirms: exp={chosen['test']['expectancy_r']:+.3f}R  "
          f"wr={chosen['test']['win_rate']:.1f}%  pf={chosen['test']['profit_factor']:.2f}")
    print(f"  full-period Rs view at that discount: sharpe={chosen_rs['sharpe']:.2f}  "
          f"maxDD={chosen_rs['max_dd']:.1f}%  net={chosen_rs['total_net']:+,.0f}")

    # max_dd is stored negative — shallowest is CLOSEST TO ZERO (largest),
    # not smallest. Reported for context; NOT the selection criterion above.
    best_dd = max(rs_results, key=lambda r: r["max_dd"])
    print(f"\n(for context only, not fold-safe: shallowest full-period drawdown "
          f"was {best_dd['discount']:.1f}% at {best_dd['max_dd']:.1f}%, "
          f"n={best_dd['trades']} trades vs {rs_results[0]['trades']} at 3.0% — "
          f"a much thinner, noisier sample)")


if __name__ == "__main__":
    main()
