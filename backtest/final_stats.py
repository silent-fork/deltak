#!/usr/bin/env python3
"""
Final shipped DKMS config, full stats sheet.

Signal generation is UNCHANGED framework.DEFAULT_CFG (same protocols, stops,
targets, dwell, windows as always shipped) -- the only changes are execution
(limit_discount_pct=12.0, thesis_exit=True; widened from the originally
shipped 3.0 after discount_sweep.py/drawdown_robustness.py -- see those for
why 12.0 and not deeper) and, in the Rs P&L section, position sizing
(riskPct=6, current shipped values for the rest).
"""
import os
import statistics

import optimize as O
import framework as F
import backtest_pnl_v2 as B

O.CACHE = os.path.join(O.HERE, "index_cache.pkl")


def r_space_report():
    idxs = O.build_all()
    train, valid, test, days = O.make_splits(idxs)
    print(f"indexes: {list(idxs)}   days: {len(days)}  train={len(train)} valid={len(valid)} test={len(test)}")
    print(f"range: {days[0]} .. {days[-1]}\n")

    cfg = dict(F.DEFAULT_CFG)
    cfg["spread_pct"] = 1.0
    cfg["limit_discount_pct"] = 12.0
    cfg["thesis_exit"] = True

    m, buckets = O.run_cfg(idxs, cfg, train, valid, test)
    print("=== R-space, by fold (spread=1.0%) ===")
    for k in ("train", "valid", "test"):
        print(f"  {k:6s} {O.fmt(m[k])}")

    all_t = buckets["train"] + buckets["valid"] + buckets["test"]
    print(f"\n=== R-space, combined all folds: n={len(all_t)} ===")
    print(f"  {O.fmt(F.evaluate(all_t))}")

    print("\n  -- per index --")
    by_u = {}
    for t in all_t:
        by_u.setdefault(t["underlying"], []).append(t)
    for u, ts in sorted(by_u.items()):
        print(f"    {u:10s} {O.fmt(F.evaluate(ts))}")

    print("\n  -- per protocol --")
    by_p = {}
    for t in all_t:
        by_p.setdefault(t["protocol"], []).append(t)
    for p, ts in sorted(by_p.items()):
        print(f"    {p:10s} {O.fmt(F.evaluate(ts))}")

    print("\n  -- exit reasons --")
    by_a = {}
    for t in all_t:
        by_a.setdefault(t["action"], []).append(t)
    for a, ts in sorted(by_a.items(), key=lambda kv: -len(kv[1])):
        e = F.evaluate(ts)
        print(f"    {a:14s} n={e['n']:4d} ({e['n']/len(all_t)*100:4.1f}%) meanR={e['expectancy_r']:+.3f} totR={e['total_r']:+.1f}")

    print("\n  -- bid-ask spread sensitivity (TEST fold) --")
    for sp in (0.0, 0.5, 1.0, 1.5, 2.0, 3.0):
        c2 = dict(cfg)
        c2["spread_pct"] = sp
        m2, _ = O.run_cfg(idxs, c2, train, valid, test)
        print(f"    spread {sp:4.1f}%  TEST {O.fmt(m2['test'])}")

    # hold time by outcome
    def hold_stats(ts):
        holds = [t.get("hold_bars", 0) for t in ts if "hold_bars" in t]
        return statistics.median(holds) if holds else None

    wins = [t for t in all_t if t["r"] > 0]
    losses = [t for t in all_t if t["r"] <= 0]
    wh, lh = hold_stats(wins), hold_stats(losses)
    if wh is not None and lh is not None:
        print(f"\n  median hold, winners={wh} bars   losers={lh} bars")

    return idxs, train, valid, test


def rupee_report():
    B.RISK_PCT = 6.0
    cfg = dict(F.DEFAULT_CFG)
    cfg["spread_pct"] = 1.0
    cfg["limit_discount_pct"] = 12.0
    cfg["limit_timeout_bars"] = 3
    cfg["thesis_exit"] = True

    O.CACHE = os.path.join(O.HERE, "index_cache.pkl")
    idxs = O.build_all()
    train, valid, test, days = O.make_splits(idxs)
    underlyings = list(idxs.keys())

    capital, trades, equity_by_day = B.run(idxs, underlyings, cfg, train, valid, test)

    by_day = {}
    for day, mtm in equity_by_day:
        by_day[day] = mtm
    ds = sorted(by_day.keys())
    equity = [by_day[d] for d in ds]

    rets = []
    for i in range(1, len(equity)):
        prev, cur = equity[i - 1], equity[i]
        if prev > 0:
            rets.append((cur - prev) / prev)
    import math
    mean_r, sd_r = statistics.mean(rets), statistics.stdev(rets)
    sharpe = (mean_r / sd_r) * math.sqrt(252) if sd_r > 0 else float("nan")
    peak, max_dd = equity[0], 0.0
    for e in equity:
        peak = max(peak, e)
        max_dd = min(max_dd, (e - peak) / peak if peak > 0 else 0)

    wins = [t for t in trades if t["net"] > 0]
    losses = [t for t in trades if t["net"] <= 0]
    total_net = sum(t["net"] for t in trades)
    gross_win = sum(t["net"] for t in wins)
    gross_loss = -sum(t["net"] for t in losses)

    print("\n\n=== Rs P&L, current shipped sizing (riskPct=6, cap=Rs 1,00,000 x5) ===")
    print(f"  trades={len(trades)}  wins={len(wins)} ({len(wins)/len(trades)*100:.1f}%)  losses={len(losses)}")
    print(f"  gross win={gross_win:+,.0f}  gross loss={-gross_loss:+,.0f}  profit factor={gross_win/gross_loss if gross_loss else float('inf'):.2f}")
    print(f"  total net P&L={total_net:+,.0f}  final capital={capital:,.0f}  (start Rs 1,00,000)")
    print(f"  mean win={statistics.mean([t['net'] for t in wins]):+,.0f}  mean loss={statistics.mean([t['net'] for t in losses]):+,.0f}")
    print(f"  mean P&L/trade={total_net/len(trades):+,.0f}")
    print(f"  calendar days marked={len(ds)} ({ds[0]} .. {ds[-1]})")
    print(f"  annualised Sharpe={sharpe:.2f}")
    print(f"  max drawdown={max_dd*100:.1f}%")

    by_u = {}
    for t in trades:
        by_u.setdefault(t["underlying"], []).append(t)
    print("\n  -- by index --")
    for u, ts in sorted(by_u.items()):
        net = sum(t["net"] for t in ts)
        wr = sum(1 for t in ts if t["net"] > 0) / len(ts) * 100
        print(f"    {u:10s} n={len(ts):4d}  win_rate={wr:5.1f}%  net={net:+12,.0f}")

    by_a = {}
    for t in trades:
        by_a.setdefault(t["action"], []).append(t)
    print("\n  -- by exit reason --")
    for a, ts in sorted(by_a.items(), key=lambda kv: -len(kv[1])):
        net = sum(t["net"] for t in ts)
        print(f"    {a:14s} n={len(ts):4d} ({len(ts)/len(trades)*100:4.1f}%)  net={net:+12,.0f}")

    # monthly trajectory
    from collections import defaultdict
    monthly = defaultdict(float)
    for d, mtm in equity_by_day:
        month = d.isoformat()[:7] if hasattr(d, "isoformat") else str(d)[:7]
        monthly[month] = mtm  # last mark per month wins
    print("\n  -- month-end equity --")
    prev = 100_000.0
    for month in sorted(monthly.keys()):
        eq = monthly[month]
        chg = (eq - prev) / prev * 100 if prev else 0
        print(f"    {month}  Rs {eq:12,.0f}  ({chg:+6.1f}% mom)")
        prev = eq


if __name__ == "__main__":
    r_space_report()
    rupee_report()
