#!/usr/bin/env python3
"""
Exports the actual trade-level records from `backtest_tiers.py`'s three
runs — every trade the shipped strategy (limit entry 12% + thesis-exit)
took, with its protocol (why it entered — ALPHA/BETA/GAMMA), exit reason
(STOP/TARGET/INVALIDATION/THESIS_BROKEN/DAYLIGHT/FORCED_CLOSE), strike,
option side, entry/exit price, lots, and net P&L after charges.

Feeds the backtest report page's downloadable trade ledgers
(web/public/downloads/backtest/) — the report's per-index/per-protocol
tables are aggregates computed from exactly this data, not a separate
source, so the CSV a visitor downloads and the numbers on the page always
agree.
"""
import csv
import json
import os

import backtest_pnl_v2 as B
import framework as F
import optimize as O

TIERS = [
    ("100000", "Rs 1,00,000 / 6% risk (shipped)", 100_000.0, 6.0),
    ("50000", "Rs 50,000 / 30% risk", 50_000.0, 30.0),
    ("25000", "Rs 25,000 / 60% risk", 25_000.0, 60.0),
]

OUT_DIR = os.path.join(os.path.dirname(__file__), "exports")
os.makedirs(OUT_DIR, exist_ok=True)

CSV_FIELDS = [
    "day", "underlying", "protocol", "opt", "strike", "lots",
    "entry", "stop", "target", "exit_price", "action",
    "entry_charge", "exit_charge", "net",
]


def run_tier(idxs, underlyings, train, valid, test, capital, risk_pct):
    B.CAPITAL0 = capital
    B.RISK_PCT = risk_pct
    cfg = dict(F.DEFAULT_CFG)
    cfg["spread_pct"] = 1.0
    cfg["limit_discount_pct"] = 12.0
    cfg["limit_timeout_bars"] = 3
    cfg["thesis_exit"] = True
    final_capital, trades, equity_by_day = B.run(idxs, underlyings, cfg, train, valid, test)
    return final_capital, trades, equity_by_day


def split_of(day, train, valid, test):
    if day in train:
        return "train"
    if day in valid:
        return "valid"
    return "test"


def write_csv(path, trades, train, valid, test):
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["split"] + CSV_FIELDS)
        w.writeheader()
        for t in trades:
            row = {k: t.get(k, "") for k in CSV_FIELDS}
            row["split"] = split_of(t["day"], train, valid, test)
            for money_field in ("entry", "stop", "target", "exit_price", "entry_charge", "exit_charge", "net"):
                if isinstance(row[money_field], (int, float)):
                    row[money_field] = round(row[money_field], 2)
            w.writerow(row)


def attribution(trades, key):
    by_key = {}
    for t in trades:
        by_key.setdefault(t[key], []).append(t)
    out = []
    for k, ts in sorted(by_key.items()):
        wins = [t for t in ts if t["net"] > 0]
        out.append({
            key: k,
            "trades": len(ts),
            "win_rate": round(len(wins) / len(ts) * 100, 1) if ts else 0,
            "net_pnl": round(sum(t["net"] for t in ts), 2),
        })
    return out


if __name__ == "__main__":
    O.CACHE = os.path.join(O.HERE, "index_cache.pkl")
    idxs = O.build_all()  # cache already built by backtest_tiers.py — reuse it
    train, valid, test, all_days = O.make_splits(idxs)
    underlyings = list(idxs.keys())

    manifest = []
    for slug, label, capital, risk_pct in TIERS:
        final_capital, trades, equity_by_day = run_tier(
            idxs, underlyings, train, valid, test, capital, risk_pct,
        )

        csv_path = os.path.join(OUT_DIR, f"trades_{slug}.csv")
        write_csv(csv_path, trades, train, valid, test)

        summary = {
            "label": label,
            "starting_capital": capital,
            "risk_pct": risk_pct,
            "final_capital": round(final_capital, 2),
            "net_pnl": round(final_capital - capital, 2),
            "trades": len(trades),
            "win_rate": round(len([t for t in trades if t["net"] > 0]) / len(trades) * 100, 1),
            "by_index": attribution(trades, "underlying"),
            "by_protocol": attribution(trades, "protocol"),
            "by_exit_reason": attribution(trades, "action"),
        }
        json_path = os.path.join(OUT_DIR, f"trades_{slug}.json")
        with open(json_path, "w") as f:
            json.dump({"summary": summary, "trades": trades}, f, indent=2, default=str)

        print(f"{label}: {len(trades)} trades -> {csv_path}, {json_path}")
        manifest.append(summary)

    with open(os.path.join(OUT_DIR, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)
    print(f"\nmanifest -> {os.path.join(OUT_DIR, 'manifest.json')}")
