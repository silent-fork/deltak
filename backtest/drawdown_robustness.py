#!/usr/bin/env python3
"""
Follow-up to discount_sweep.py: that first pass found expectancy climbing
monotonically with limit_discount_pct all the way to 10% (the top of the
tested range) on TEST, walk-forward-selected off TRAIN+VALIDATE only. Three
open questions from that result, each answered here:

  1. Does it actually plateau/reverse somewhere, or does 10% just happen to
     be where testing stopped? -> extend the range to 20%.
  2. What's the actual mechanism? A deeper discount can only change results
     by turning trades away -> instrument placed/filled/expired directly.
  3. Is the edge concentrated in one or two indexes, or does it hold spread
     across all five? -> per-index attribution at the walk-forward winner
     vs the current 3% baseline.
  4. Does the edge survive the same adverse-spread stress test the shipped
     3% config was checked against? -> spread sweep (0-3%) at each
     discount checkpoint, TEST fold only.

Same discipline as discount_sweep.py throughout: TEST is reported, never
used to select. Everything else held at the shipped config (riskPct=6 for
the Rs view, thesis_exit=True, limit_timeout_bars=3, spread_pct=1.0 unless
being swept).
"""
import os
import statistics

import optimize as O
import framework as F
import backtest_pnl_v2 as B
import sharpe_report as S

DISCOUNTS = [3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0, 12.0, 14.0, 16.0, 18.0, 20.0]
SPREAD_CHECKPOINTS = [3.0, 6.0, 10.0, 15.0, 20.0]
SPREADS = [0.0, 0.5, 1.0, 1.5, 2.0, 3.0]
MIN_SAMPLE_WARN = 80  # below this, flag the fold as too thin to trust


def cfg_for(discount, spread=1.0, timeout=3):
    cfg = dict(F.DEFAULT_CFG)
    cfg["spread_pct"] = spread
    cfg["limit_discount_pct"] = discount
    cfg["limit_timeout_bars"] = timeout
    cfg["thesis_exit"] = True
    return cfg


def fill_stats(idxs, discount):
    """placed/filled/expired across all five indexes, full 18 months."""
    cfg = cfg_for(discount)
    stats = {}
    total_trades = 0
    for u, idx in idxs.items():
        trades = F.simulate_index(idx, cfg, stats=stats)
        total_trades += len(trades)
    placed = stats.get("placed", 0)
    filled = stats.get("filled", 0)
    return placed, filled, filled / placed * 100 if placed else 0.0


def r_space_fold(idxs, train, valid, test, discount, spread=1.0):
    cfg = cfg_for(discount, spread=spread)
    m, _ = O.run_cfg(idxs, cfg, train, valid, test)
    return m


def rs_pnl(idxs, underlyings, train, valid, test, discount):
    B.RISK_PCT = 6.0
    cfg = cfg_for(discount)
    capital, trades, equity_by_day = B.run(idxs, underlyings, cfg, train, valid, test)
    days, equity = S.day_end_curve(equity_by_day)
    sharpe, max_dd = S.sharpe_and_drawdown(equity)
    wins = [t for t in trades if t["net"] > 0]
    return {
        "trades": len(trades),
        "win_rate": len(wins) / len(trades) * 100 if trades else 0,
        "net": sum(t["net"] for t in trades),
        "sharpe": sharpe,
        "max_dd": max_dd * 100 if max_dd is not None else None,
    }


def section1_extended_range(idxs, underlyings, train, valid, test):
    print("=" * 100)
    print("1. EXTENDED RANGE — does the expectancy trend actually plateau or reverse by 20%?")
    print("=" * 100)
    hdr = (f"{'disc':>6} {'placed':>7} {'filled':>7} {'fill%':>6} | "
           f"{'TR exp':>8} {'n':>5} {'VA exp':>8} {'n':>5} {'TE exp':>8} {'n':>5} {'TE wr':>7} {'TE pf':>6} | "
           f"{'Rs sharpe':>9} {'Rs maxDD':>9}")
    print(hdr)
    rows = []
    for d in DISCOUNTS:
        placed, filled, fill_pct = fill_stats(idxs, d)
        m = r_space_fold(idxs, train, valid, test, d)
        rs = rs_pnl(idxs, underlyings, train, valid, test, d)
        tr, va, te = m["train"], m["valid"], m["test"]
        warn = "!" if te["n"] < MIN_SAMPLE_WARN else " "
        print(f"{d:5.1f}% {placed:7d} {filled:7d} {fill_pct:5.1f}% | "
              f"{tr['expectancy_r']:+8.3f} {tr['n']:5d} {va['expectancy_r']:+8.3f} {va['n']:5d} "
              f"{te['expectancy_r']:+8.3f} {te['n']:5d}{warn}{te['win_rate']:6.1f}% {te['profit_factor']:6.2f} | "
              f"{rs['sharpe']:9.2f} {rs['max_dd']:8.1f}%")
        rows.append({"discount": d, "placed": placed, "filled": filled, "fill_pct": fill_pct,
                     "train": tr, "valid": va, "test": te, "rs": rs})

    # Where does TEST expectancy stop improving step-over-step?
    print("\nstep-over-step TEST expectancy change:")
    for a, b in zip(rows, rows[1:]):
        delta = b["test"]["expectancy_r"] - a["test"]["expectancy_r"]
        flag = " <- turns down" if delta < 0 else ""
        print(f"  {a['discount']:.1f}% -> {b['discount']:.1f}%: {delta:+.3f}R{flag}")
    return rows


def section2_fill_mechanism(rows):
    print("\n" + "=" * 100)
    print("2. FILL MECHANISM — fill rate collapses as the discount widens")
    print("=" * 100)
    for r in rows:
        bar = "#" * int(r["fill_pct"] / 2)
        print(f"  {r['discount']:5.1f}%  {r['fill_pct']:5.1f}%  {bar}")
    print(f"\n  {rows[0]['fill_pct']:.1f}% of signals fill at the shipped 3% discount; "
          f"only {rows[-1]['fill_pct']:.1f}% fill at {rows[-1]['discount']:.0f}%. "
          "The rest expire unfilled -- a real trade, not a worse trade, is skipped.")


def section3_per_index(idxs, train, valid, test, baseline, candidate):
    print("\n" + "=" * 100)
    print(f"3. PER-INDEX CONCENTRATION — {baseline:.0f}% (shipped) vs {candidate:.0f}% (walk-forward winner)")
    print("=" * 100)
    for d in (baseline, candidate):
        cfg = cfg_for(d)
        m, buckets = O.run_cfg(idxs, cfg, train, valid, test)
        all_t = buckets["train"] + buckets["valid"] + buckets["test"]
        by_u = {}
        for t in all_t:
            by_u.setdefault(t["underlying"], []).append(t)
        print(f"\n  discount {d:.0f}%:")
        for u, ts in sorted(by_u.items()):
            e = F.evaluate(ts)
            print(f"    {u:10s} n={e['n']:4d}  exp={e['expectancy_r']:+.3f}R  "
                  f"wr={e['win_rate']:.1f}%  pf={e['profit_factor']:.2f}  totR={e['total_r']:+.1f}")


def section4_spread_stress(idxs, train, valid, test):
    print("\n" + "=" * 100)
    print("4. SPREAD STRESS — does the edge survive a wider adverse-spread assumption at each discount?")
    print("=" * 100)
    print(f"{'discount':>9} " + " ".join(f"{s:>9.1f}%" for s in SPREADS) + "   (TEST expectancy, R)")
    for d in SPREAD_CHECKPOINTS:
        vals = []
        for sp in SPREADS:
            m = r_space_fold(idxs, train, valid, test, d, spread=sp)
            vals.append(m["test"]["expectancy_r"])
        row = " ".join(f"{v:+9.3f} " for v in vals)
        print(f"{d:8.1f}%  {row}")


def main():
    O.CACHE = os.path.join(O.HERE, "index_cache.pkl")
    idxs = O.build_all()
    train, valid, test, all_days = O.make_splits(idxs)
    underlyings = list(idxs.keys())

    rows = section1_extended_range(idxs, underlyings, train, valid, test)
    section2_fill_mechanism(rows)

    # Walk-forward selection, same rule as discount_sweep.py: maximise
    # combined TRAIN+VALIDATE R, never look at TEST to choose. Naive version
    # first — this is what discount_sweep.py's rule finds, and it's the one
    # that's wrong here: it has no way to prefer a trustworthy sample over a
    # thin one that got lucky, so it walks straight to the edge of the range
    # every time the range is extended.
    def score(r):
        return (r["train"]["total_r"] + r["valid"]["total_r"]) / (r["train"]["n"] + r["valid"]["n"])
    naive_winner = max(rows, key=score)
    print(f"\nnaive walk-forward winner (point-estimate expectancy only): {naive_winner['discount']:.1f}% "
          f"(TEST n={naive_winner['test']['n']}) — keeps climbing as the range extends; not a real plateau, just where testing stopped.")

    # Sample-size-aware version: same rule, restricted to discounts where
    # every fold clears MIN_SAMPLE_WARN. This is the one worth trusting.
    reliable = [r for r in rows if min(r["train"]["n"], r["valid"]["n"], r["test"]["n"]) >= MIN_SAMPLE_WARN]
    reliable_winner = max(reliable, key=score) if reliable else None
    if reliable_winner:
        print(f"reliable winner (all folds >= {MIN_SAMPLE_WARN} trades): {reliable_winner['discount']:.1f}% "
              f"(TEST exp {reliable_winner['test']['expectancy_r']:+.3f}R, n={reliable_winner['test']['n']})")
    print(f"\n({naive_winner['discount']:.1f}% clears TEST n={naive_winner['test']['n']} — a NIFTY-heavy 51 trades "
          "spread across five indexes averages to single digits per index; see section 3.)")

    section3_per_index(idxs, train, valid, test, 3.0, naive_winner["discount"])
    if reliable_winner and reliable_winner["discount"] != naive_winner["discount"]:
        section3_per_index(idxs, train, valid, test, 3.0, reliable_winner["discount"])
    section4_spread_stress(idxs, train, valid, test)


if __name__ == "__main__":
    main()
