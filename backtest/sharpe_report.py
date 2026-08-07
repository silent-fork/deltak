#!/usr/bin/env python3
"""
Rupee-equity Sharpe/drawdown for OLD (marketable entry, no thesis-exit,
riskPct=15 -- the pre-fix shipped config) vs NEW (limit entry 3.0% +
thesis-exit, riskPct=6 -- the current shipped config), full 370-day
calendar (every trading day in the dataset gets a day-end equity mark,
not just days a trade closed on).
"""
import math
import os
import statistics

import backtest_pnl_v2 as B
import optimize as O
import framework as F

TRADING_DAYS_PER_YEAR = 252


def day_end_curve(equity_by_day):
    by_day = {}
    for day, mtm in equity_by_day:
        by_day[day] = mtm  # last write per day wins -> day's final mark
    days = sorted(by_day.keys())
    return days, [by_day[d] for d in days]


def sharpe_and_drawdown(equity):
    rets = []
    for i in range(1, len(equity)):
        prev, cur = equity[i - 1], equity[i]
        if prev > 0:
            rets.append((cur - prev) / prev)
    if len(rets) < 2:
        return None, None
    mean_r = statistics.mean(rets)
    sd_r = statistics.stdev(rets)
    sharpe = (mean_r / sd_r) * math.sqrt(TRADING_DAYS_PER_YEAR) if sd_r > 0 else float("nan")

    peak = equity[0]
    max_dd = 0.0
    for e in equity:
        peak = max(peak, e)
        dd = (e - peak) / peak if peak > 0 else 0
        max_dd = min(max_dd, dd)
    return sharpe, max_dd


def run_variant(idxs, underlyings, train, valid, test, label, risk_pct, limit_discount, thesis_exit):
    B.RISK_PCT = risk_pct
    cfg = dict(F.DEFAULT_CFG)
    cfg["spread_pct"] = 1.0
    cfg["limit_discount_pct"] = limit_discount
    cfg["limit_timeout_bars"] = 3
    cfg["thesis_exit"] = thesis_exit
    capital, trades, equity_by_day = B.run(idxs, underlyings, cfg, train, valid, test)

    days, equity = day_end_curve(equity_by_day)
    sharpe, max_dd = sharpe_and_drawdown(equity)

    wins = [t for t in trades if t["net"] > 0]
    total_net = sum(t["net"] for t in trades)
    print(f"\n=== {label} (riskPct={risk_pct}, discount={limit_discount}%, thesis_exit={thesis_exit}) ===")
    print(f"  trades={len(trades)}  win_rate={len(wins)/len(trades)*100:.1f}%  "
          f"total_net={total_net:+,.0f}  final_capital={capital:,.0f}")
    print(f"  calendar days marked={len(days)} ({days[0]} .. {days[-1]})")
    print(f"  annualized Sharpe={sharpe:.2f}  max drawdown={max_dd*100:.1f}%")
    per_trade = total_net / len(trades) if trades else 0
    print(f"  mean P&L per trade={per_trade:+,.0f}")
    return capital, trades, days, equity, sharpe, max_dd


if __name__ == "__main__":
    O.CACHE = os.path.join(O.HERE, "index_cache.pkl")
    idxs = O.build_all()
    train, valid, test, all_days = O.make_splits(idxs)
    underlyings = list(idxs.keys())

    run_variant(idxs, underlyings, train, valid, test,
                "OLD strategy (as originally shipped)", risk_pct=15.0,
                limit_discount=0.0, thesis_exit=False)

    run_variant(idxs, underlyings, train, valid, test,
                "NEW strategy at OLD sizing (isolate the signal fix)", risk_pct=15.0,
                limit_discount=3.0, thesis_exit=True)

    run_variant(idxs, underlyings, train, valid, test,
                "NEW strategy, current shipped sizing", risk_pct=6.0,
                limit_discount=3.0, thesis_exit=True)
