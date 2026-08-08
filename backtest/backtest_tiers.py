#!/usr/bin/env python3
"""
The shipped strategy (limit entry 12% + thesis-exit — see
`sharpe_report.py`'s "current shipped config" variant) run at three
starting-balance/riskPct pairings instead of just the live Rs 1,00,000/6%
one: the new `resetPresets.ts` tiers added to the paper-wallet reset panel
(Rs 25,000/60% risk, Rs 50,000/30% risk), run through the identical
methodology and the same historical data as the shipped Rs 1,00,000/6%
report, so the three are actually comparable rather than apples-to-oranges.

`maxPositionCapitalPct`/`maxPortfolioRiskPct` stay at the shipped 60/20
across all three tiers on purpose — see `lib/engine/resetPresets.ts`'s own
doc comment: those are pure percentages of equity that don't need to move
with capital the way `riskPct` does (riskPct is what has to change to
clear the same per-index 1-lot floors at a smaller float).
"""
import os

import backtest_pnl_v2 as B
import framework as F
import optimize as O
import sharpe_report as S

TIERS = [
    ("Rs 1,00,000 / 6% risk (shipped)", 100_000.0, 6.0),
    ("Rs 50,000 / 30% risk", 50_000.0, 30.0),
    ("Rs 25,000 / 60% risk", 25_000.0, 60.0),
]


def run_tier(idxs, underlyings, train, valid, test, label, capital, risk_pct):
    B.CAPITAL0 = capital
    B.RISK_PCT = risk_pct
    cfg = dict(F.DEFAULT_CFG)
    cfg["spread_pct"] = 1.0
    cfg["limit_discount_pct"] = 12.0
    cfg["limit_timeout_bars"] = 3
    cfg["thesis_exit"] = True

    final_capital, trades, equity_by_day = B.run(idxs, underlyings, cfg, train, valid, test)
    days, equity = S.day_end_curve(equity_by_day)
    sharpe, max_dd = S.sharpe_and_drawdown(equity)

    n = len(trades)
    wins = [t for t in trades if t["net"] > 0]
    total_net = sum(t["net"] for t in trades)
    win_rate = len(wins) / n * 100 if n else 0.0
    pnl_pct = total_net / capital * 100 if capital else 0.0

    print(f"\n=== {label} ===")
    print(f"  starting capital: Rs {capital:,.0f}    riskPct: {risk_pct}%")
    print(f"  final capital:    Rs {final_capital:,.0f}  (P&L {total_net:+,.0f}, {pnl_pct:+.1f}%)")
    print(f"  trades: {n}  win_rate: {win_rate:.1f}%")
    print(f"  annualized Sharpe: {sharpe:.2f}   max drawdown: {max_dd * 100:.1f}%")

    by_u = {}
    for t in trades:
        by_u.setdefault(t["underlying"], []).append(t["net"])
    for u, ns in sorted(by_u.items()):
        wr = sum(1 for x in ns if x > 0) / len(ns) * 100 if ns else 0.0
        print(f"    {u:10s} n={len(ns):3d}  pnl={sum(ns):+10,.0f}  win_rate={wr:.0f}%")

    for name, split in (("train", train), ("valid", valid), ("test", test)):
        sub = [t for t in trades if t["day"] in split]
        if sub:
            sub_pnl = sum(t["net"] for t in sub)
            wr = sum(1 for t in sub if t["net"] > 0) / len(sub) * 100
            print(f"  {name:6s}: n={len(sub):4d}  pnl={sub_pnl:+10,.0f}  win_rate={wr:.1f}%")

    return {
        "label": label, "capital": capital, "risk_pct": risk_pct,
        "final_capital": final_capital, "total_net": total_net, "pnl_pct": pnl_pct,
        "trades": n, "win_rate": win_rate, "sharpe": sharpe, "max_dd": max_dd,
    }


if __name__ == "__main__":
    O.CACHE = os.path.join(O.HERE, "index_cache.pkl")
    # force=True: the checked-in index_cache.pkl is a stale 5-byte stub
    # (index_cache.pkl is gitignored, but an empty placeholder was present),
    # not built from this run's freshly-fetched deep_data/ — build_all()
    # would otherwise happily load that stub and return an empty dict.
    idxs = O.build_all(force=True)
    train, valid, test, all_days = O.make_splits(idxs)
    underlyings = list(idxs.keys())

    results = []
    for label, capital, risk_pct in TIERS:
        results.append(run_tier(idxs, underlyings, train, valid, test, label, capital, risk_pct))

    print("\n\n=== Comparison ===")
    print(f"{'Tier':32s} {'P&L %':>8s} {'Sharpe':>8s} {'Max DD':>8s} {'Trades':>7s} {'Win %':>7s}")
    for r in results:
        print(f"{r['label']:32s} {r['pnl_pct']:+7.1f}% {r['sharpe']:8.2f} "
              f"{r['max_dd'] * 100:7.1f}% {r['trades']:7d} {r['win_rate']:6.1f}%")
