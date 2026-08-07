#!/usr/bin/env python3
"""
Parameter search with walk-forward validation.

Methodology (this is the part that matters more than the search itself):

  TRAIN (oldest 60% of days)  - search runs here, and only here
  VALID (next 20%)            - the top TRAIN candidates are re-scored here;
                                the single config to carry forward is chosen
                                on VALID, not TRAIN
  TEST  (newest 20%)          - looked at ONCE, for the final config only.
                                No selection happens against TEST.

Objective is expectancy in R. Win rate is a reported statistic and, in the
constrained runs, a filter — never the thing being maximised. Maximising win
rate directly is degenerate: target_r -> 0 buys an arbitrarily high win rate
at negative expectancy, and the search would find that immediately.

Positions are intraday-only (every open position is closed at Daylight Rest
or on a day change), so bucketing completed trades by their entry day into
the three splits introduces no cross-boundary position leakage.
"""
import os
import pickle
import random
import itertools
import statistics
import sys
import framework as F

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.join(HERE, "index_cache.pkl")
UNDERLYINGS = ["NIFTY", "BANKNIFTY", "FINNIFTY", "SENSEX", "BANKEX"]
OFFSETS = list(range(-5, 6))

MIN_TRADES_TRAIN = 60
MIN_TRADES_VALID = 20

# Round-trip bid-ask cost assumption, percent of premium. Deliberately NOT a
# searched parameter — the optimizer would simply choose 0% and report a
# fantasy. Deep-ITM index options are the tightest part of the book, so 1.0%
# round trip is a reasonable central case; sensitivity is reported explicitly
# at the end because the edges found here are thin enough for it to matter.
SPREAD_PCT = 1.0


def build_all(force=False):
    if os.path.exists(CACHE) and not force:
        with open(CACHE, "rb") as f:
            return pickle.load(f)
    idxs = {}
    for u in UNDERLYINGS:
        sys.stderr.write(f"building {u}...\n")
        sys.stderr.flush()
        idx = F.build_index(u, OFFSETS)
        if idx:
            idxs[u] = idx
    with open(CACHE, "wb") as f:
        pickle.dump(idxs, f)
    return idxs


def make_splits(idxs):
    days = set()
    for idx in idxs.values():
        for b in idx["bars"]:
            if b:
                days.add(b["day"])
    days = sorted(days)
    n = len(days)
    a, b = int(n * 0.60), int(n * 0.80)
    return set(days[:a]), set(days[a:b]), set(days[b:]), days


SPACE = {
    "protocols": [p for r in (1, 2, 3)
                  for p in itertools.combinations(("ALPHA", "BETA", "GAMMA"), r)],
    "stop_pct": [0.12, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40],
    "target_r": [0.25, 0.4, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5],
    "max_hold_bars": [1, 2, 3, 4, 6, 9, 12, 18, None],
    "trend_align": [False, True],
    "chop_filter": [False, True],
    "dwell": [1, 2, 3, 4, 5],
    "entry_from_min": [F.MARKET_OPEN_MIN + d for d in (10, 15, 30, 45, 60)],
    "entry_to_min": [F.DAYLIGHT_REST_MIN, F.DAYLIGHT_REST_MIN - 30,
                     F.DAYLIGHT_REST_MIN - 60, 13 * 60],
    "depths": [(2, 3), (2,), (3,)],
    "use_invalidation": [True, False],
    "breakeven_at_r": [None, 0.3, 0.5, 0.75, 1.0],
    "pcr_rule": [False, True],
    "iv_max_pctile": [None, 0.9, 0.8, 0.6],
    "invert_direction": [False, True],
}


def sample_cfg(rng):
    cfg = {k: rng.choice(v) for k, v in SPACE.items()}
    cfg["spread_pct"] = SPREAD_PCT
    return cfg


def run_cfg(idxs, cfg, train, valid, test):
    buckets = {"train": [], "valid": [], "test": []}
    for u, idx in idxs.items():
        for t in F.simulate_index(idx, cfg):
            if t["day"] in train:
                buckets["train"].append(t)
            elif t["day"] in valid:
                buckets["valid"].append(t)
            elif t["day"] in test:
                buckets["test"].append(t)
    return {k: F.evaluate(v) for k, v in buckets.items()}, buckets


def fmt(m):
    if not m or m["n"] == 0:
        return "n=0"
    return (f"n={m['n']:4d} exp={m['expectancy_r']:+.3f}R wr={m['win_rate']:.1f}% "
            f"pf={m['profit_factor']:.2f} totR={m['total_r']:+.1f}")


def main():
    n_samples = int(sys.argv[1]) if len(sys.argv) > 1 else 2000
    idxs = build_all()
    train, valid, test, days = make_splits(idxs)
    print(f"indexes: {list(idxs)}")
    print(f"days: {len(days)}  train={len(train)} valid={len(valid)} test={len(test)}")
    print(f"range: {days[0]} .. {days[-1]}")

    base_cfg = dict(F.DEFAULT_CFG)
    base_cfg["spread_pct"] = SPREAD_PCT
    base, _ = run_cfg(idxs, base_cfg, train, valid, test)
    print(f"\n--- BASELINE (current production logic, spread={SPREAD_PCT}%) ---")
    for k in ("train", "valid", "test"):
        print(f"  {k:6s} {fmt(base[k])}")

    rng = random.Random(7)
    seen = set()
    results = []
    for s in range(n_samples):
        cfg = sample_cfg(rng)
        key = tuple(sorted((k, str(v)) for k, v in cfg.items()))
        if key in seen:
            continue
        seen.add(key)
        m, _ = run_cfg(idxs, cfg, train, valid, test)
        if m["train"]["n"] >= MIN_TRADES_TRAIN:
            results.append((cfg, m))
        if (s + 1) % 250 == 0:
            print(f"  ...sampled {s+1}/{n_samples}, kept {len(results)}", flush=True)

    print(f"\nkept {len(results)} configs meeting min-trades on TRAIN")

    # ---- unconstrained: best expectancy on TRAIN, confirmed on VALID ----
    by_train = sorted(results, key=lambda r: -r[1]["train"]["expectancy_r"])[:40]
    by_train = [r for r in by_train if r[1]["valid"]["n"] >= MIN_TRADES_VALID]
    print("\n--- top TRAIN candidates, re-scored on VALID ---")
    for cfg, m in by_train[:12]:
        print(f"  TRAIN {fmt(m['train'])}")
        print(f"  VALID {fmt(m['valid'])}   <- {short(cfg)}")
    finalists = {}
    if by_train:
        best = max(by_train, key=lambda r: r[1]["valid"]["expectancy_r"])
        finalists["max_expectancy"] = best[0]

    # ---- constrained: win-rate floors ----
    for floor in (60, 70, 75, 80):
        pool = [r for r in results
                if r[1]["train"]["win_rate"] is not None
                and r[1]["train"]["win_rate"] >= floor
                and r[1]["valid"]["n"] >= MIN_TRADES_VALID]
        print(f"\n--- constrained: TRAIN win rate >= {floor}%  ({len(pool)} configs) ---")
        if not pool:
            print("   none")
            continue
        pool.sort(key=lambda r: -r[1]["train"]["expectancy_r"])
        for cfg, m in pool[:5]:
            print(f"  TRAIN {fmt(m['train'])}")
            print(f"  VALID {fmt(m['valid'])}   <- {short(cfg)}")
        bestc = max(pool[:20], key=lambda r: r[1]["valid"]["expectancy_r"])
        print(f"  >> best-on-VALID at this floor:")
        for k in ("train", "valid", "test"):
            print(f"     {k:6s} {fmt(bestc[1][k])}")
        print(f"     cfg {short(bestc[0])}")
        finalists[f"wr>={floor}"] = bestc[0]

    # ---- robustness: does the NEIGHBOURHOOD hold up, or just one config? ----
    # A single best config surviving TEST can easily be luck drawn from a
    # large search. If the top-N by VALID are mostly positive on TEST, the
    # effect is far more likely to be real than a single point estimate.
    pool = [r for r in results if r[1]["valid"]["n"] >= MIN_TRADES_VALID]
    pool.sort(key=lambda r: -r[1]["valid"]["expectancy_r"])
    for topn in (10, 25, 50):
        sub = pool[:topn]
        if not sub:
            continue
        te = [r[1]["test"]["expectancy_r"] for r in sub if r[1]["test"]["n"] >= 15]
        tw = [r[1]["test"]["win_rate"] for r in sub if r[1]["test"]["n"] >= 15]
        if not te:
            continue
        pos = sum(1 for x in te if x > 0)
        print(f"\n--- robustness: top {topn} by VALID expectancy, scored on TEST ---")
        print(f"    {pos}/{len(te)} positive on TEST   "
              f"median TEST exp={statistics.median(te):+.3f}R   "
              f"median TEST win rate={statistics.median(tw):.1f}%")

    for name, cfg in finalists.items():
        deep_report(idxs, cfg, train, valid, test, f"FINAL CANDIDATE: {name}")


def deep_report(idxs, cfg, train, valid, test, title):
    print(f"\n{'='*78}\n{title}\n{'='*78}")
    print(f"  cfg {short(cfg)}")
    m, buckets = run_cfg(idxs, cfg, train, valid, test)
    for k in ("train", "valid", "test"):
        print(f"  {k:6s} {fmt(m[k])}")

    all_tr = buckets["train"] + buckets["valid"] + buckets["test"]
    print("\n  -- per index (all folds) --")
    by_u = {}
    for t in all_tr:
        by_u.setdefault(t["underlying"], []).append(t)
    for u, ts in sorted(by_u.items()):
        print(f"    {u:10s} {fmt(F.evaluate(ts))}")

    print("\n  -- per protocol (all folds) --")
    by_p = {}
    for t in all_tr:
        by_p.setdefault(t["protocol"], []).append(t)
    for p, ts in sorted(by_p.items()):
        print(f"    {p:10s} {fmt(F.evaluate(ts))}")

    print("\n  -- exit reasons (all folds) --")
    by_a = {}
    for t in all_tr:
        by_a.setdefault(t["action"], []).append(t)
    for a, ts in sorted(by_a.items(), key=lambda kv: -len(kv[1])):
        e = F.evaluate(ts)
        print(f"    {a:12s} n={e['n']:4d} ({e['n']/len(all_tr)*100:4.1f}%) "
              f"meanR={e['expectancy_r']:+.3f}")

    print("\n  -- bid-ask spread sensitivity (TEST fold, out of sample) --")
    for sp in (0.0, 0.5, 1.0, 1.5, 2.0, 3.0):
        c2 = dict(cfg)
        c2["spread_pct"] = sp
        m2, _ = run_cfg(idxs, c2, train, valid, test)
        print(f"    spread {sp:4.1f}%  TEST {fmt(m2['test'])}")
    return m, buckets


def short(cfg):
    return (f"proto={'+'.join(cfg['protocols'])} stop={cfg['stop_pct']} tgt={cfg['target_r']}R "
            f"hold={cfg['max_hold_bars']} trend={int(cfg['trend_align'])} "
            f"chop={int(cfg['chop_filter'])} dwell={cfg['dwell']} "
            f"win=[{cfg['entry_from_min']},{cfg['entry_to_min']}) d={cfg['depths']} "
            f"inv={int(cfg['use_invalidation'])} be={cfg['breakeven_at_r']} "
            f"pcr={int(bool(cfg.get('pcr_rule')))} ivmax={cfg.get('iv_max_pctile')} "
            f"INV={int(bool(cfg.get('invert_direction')))}")


if __name__ == "__main__":
    main()
