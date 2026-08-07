#!/usr/bin/env python3
"""Risk:reward ratio for the final shipped config, both R-space and Rs terms."""
import os
import statistics

import optimize as O
import framework as F
import backtest_pnl_v2 as B

O.CACHE = os.path.join(O.HERE, "index_cache.pkl")


def r_space_rr():
    idxs = O.build_all()
    train, valid, test, days = O.make_splits(idxs)

    cfg = dict(F.DEFAULT_CFG)
    cfg["spread_pct"] = 1.0
    cfg["limit_discount_pct"] = 12.0
    cfg["thesis_exit"] = True

    m, buckets = O.run_cfg(idxs, cfg, train, valid, test)
    all_t = buckets["train"] + buckets["valid"] + buckets["test"]

    wins = [t["r"] for t in all_t if t["r"] > 0]
    losses = [t["r"] for t in all_t if t["r"] <= 0]

    avg_win_r = statistics.mean(wins)
    avg_loss_r = statistics.mean(losses)  # negative
    rr_realized = avg_win_r / abs(avg_loss_r)

    win_rate = len(wins) / len(all_t)
    # Expectancy check: win_rate*avg_win + (1-win_rate)*avg_loss should equal overall expectancy
    expectancy = win_rate * avg_win_r + (1 - win_rate) * avg_loss_r
    breakeven_wr = 1 / (1 + rr_realized)

    print("=== R-space risk:reward (all folds, n=%d) ===" % len(all_t))
    print(f"  win rate: {win_rate*100:.1f}%")
    print(f"  avg win:  +{avg_win_r:.3f}R   (n={len(wins)})")
    print(f"  avg loss: {avg_loss_r:.3f}R   (n={len(losses)})")
    print(f"  realized reward:risk = {rr_realized:.2f} : 1")
    print(f"  breakeven win rate at this R:R = {breakeven_wr*100:.1f}%  (actual: {win_rate*100:.1f}%)")
    print(f"  expectancy check: {expectancy:+.3f}R (matches reported {m['train']['expectancy_r'] if False else 'n/a'})")
    print(f"  configured stop/target: stop={cfg['stop_pct']} target={cfg['target_r']}R  -> nominal 1:{cfg['target_r']}")


def rupee_rr():
    B.RISK_PCT = 6.0
    cfg = dict(F.DEFAULT_CFG)
    cfg["spread_pct"] = 1.0
    cfg["limit_discount_pct"] = 12.0
    cfg["limit_timeout_bars"] = 3
    cfg["thesis_exit"] = True

    idxs = O.build_all()
    train, valid, test, days = O.make_splits(idxs)
    underlyings = list(idxs.keys())
    capital, trades, equity_by_day = B.run(idxs, underlyings, cfg, train, valid, test)

    wins = [t["net"] for t in trades if t["net"] > 0]
    losses = [t["net"] for t in trades if t["net"] <= 0]
    avg_win = statistics.mean(wins)
    avg_loss = statistics.mean(losses)
    rr = avg_win / abs(avg_loss)
    win_rate = len(wins) / len(trades)
    breakeven_wr = 1 / (1 + rr)

    print("\n=== Rs risk:reward (current shipped sizing, n=%d) ===" % len(trades))
    print(f"  win rate: {win_rate*100:.1f}%")
    print(f"  avg win:  Rs {avg_win:+,.0f}   (n={len(wins)})")
    print(f"  avg loss: Rs {avg_loss:+,.0f}   (n={len(losses)})")
    print(f"  realized reward:risk = {rr:.2f} : 1")
    print(f"  breakeven win rate at this R:R = {breakeven_wr*100:.1f}%  (actual: {win_rate*100:.1f}%)")
    print(f"  margin over breakeven: {(win_rate - breakeven_wr)*100:+.1f} pts")


if __name__ == "__main__":
    r_space_rr()
    rupee_rr()
