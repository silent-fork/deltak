#!/usr/bin/env python3
"""
Tests the SELLER-side analogue of what the app currently does.

The app's own stated philosophy is the institutional option seller's: high OI
marks where writers have committed margin, so those strikes are defended.
The implementation then takes the *buyer's* side of that thesis — it buys a
deep-ITM CE when spot sits at the put wall. A buyer needs price to actually
move; a seller only needs it not to break the wall. Same thesis, structurally
different payoff, and the seller version is where genuinely high win rates in
options come from.

Structure tested (defined risk, no naked legs):
  spot near Aegis-1 (put wall)     -> SELL put spread below it   (bull put)
  spot near Zenith-1 (call wall)   -> SELL call spread above it  (bear call)

Both are one-strike-wide verticals: short the wall strike, long the next
strike further OTM. Risk is capped at (width - credit), which is the R unit
everything below is denominated in.

Honest limits of this test, stated up front:
  - Spread legs are priced at each leg's 5-min CLOSE. There are no bid/ask
    quotes in this dataset, so a spread-cost assumption is applied explicitly
    and swept, exactly as in the long-option work. A 4-leg round trip crosses
    the spread four times, so this matters MORE here, not less.
  - Intraday only: entered and closed the same session. Holding a short
    vertical to expiry is where most of its theta actually is, so this is a
    conservative reading of the structure, not a flattering one.
  - Margin is not modelled. A real short vertical blocks margin roughly equal
    to its max loss, which is what caps position count in practice.
  - Assignment/pin risk near expiry is not modelled.
"""
import os
import sys
import statistics
import framework as F
import optimize as O

WIDTH_OFFSETS = 1     # one strike wide


def spread_pnl_test(idxs, train, valid, test, cfg):
    """Returns trades in R units, R = max loss = width - credit."""
    out = []
    for u, idx in idxs.items():
        icfg = F.INDEX_CFG[u]
        step = icfg["strikeStep"]
        lot = icfg["lotSize"]
        rates = idx["rates"]
        pos = None
        last_exit = -1

        for b in idx["bars"]:
            if b is None:
                continue

            # ---------------- exit ---------------- #
            if pos is not None:
                # Track BOTH legs by absolute strike — see framework.find_leg.
                sc, _ = F.find_leg(b, pos["side"], pos["short_strike"], step)
                lc, _ = F.find_leg(b, pos["side"], pos["long_strike"], step)
                if sc and lc and sc["close"] > 0:
                    cur = max(0.0, sc["close"] - lc["close"])
                    pos["last_sc"], pos["last_lc"] = sc, lc
                else:
                    sc, lc = pos["last_sc"], pos["last_lc"]
                    cur = max(0.0, sc["close"] - lc["close"]) if sc and lc else pos["credit"]
                action = None
                if b["smin"] >= F.DAYLIGHT_REST_MIN or b["day"] != pos["day"]:
                    action = "EOD"
                elif cfg["stop_mult"] and cur >= pos["credit"] * (1 + cfg["stop_mult"]):
                    action = "STOP"
                elif cfg["take_frac"] and cur <= pos["credit"] * (1 - cfg["take_frac"]):
                    action = "TAKE"
                if action:
                    half = cfg["spread_pct"] / 2 / 100
                    # closing a short vertical: buy it back, pay up
                    exit_cost = cur * (1 + half) if cur > 0 else 0.0
                    gross = (pos["credit_net"] - exit_cost) * lot
                    # four legs of charges across the round trip
                    ch = (F.charge_leg("SELL", max(sc["close"], 0.05) if sc else 1, lot, rates)
                          + F.charge_leg("BUY", max(lc["close"], 0.05) if lc else 1, lot, rates)) * 2
                    net = gross - ch
                    risk = pos["risk"] * lot
                    out.append({"underlying": u, "protocol": pos["proto"], "opt": pos["side"],
                                "action": action, "r": net / risk if risk > 0 else 0,
                                "net": net, "day": pos["day"], "hold": 0})
                    pos = None
                    last_exit = b["i"]
            if pos is not None:
                continue
            if b["i"] <= last_exit:
                continue

            # ---------------- entry ---------------- #
            p = b["protocol"]
            if p is None or p == "DELTA" or p not in cfg["protocols"]:
                continue
            if not (cfg["entry_from_min"] <= b["smin"] < cfg["entry_to_min"]):
                continue

            # The institutional-seller setup is NOT "sell at the wall while
            # spot sits on it" — that short leg is ~ATM and roughly a coin
            # flip. It is "the wall is defended, so sell premium BEYOND it
            # while spot is a safe distance inside the range." Distance from
            # the wall is therefore a requirement, not an entry trigger.
            side = short_off = long_off = None
            dmin = cfg["min_dist_pct"] / 100
            a, z = b["aegis1"], b["zenith1"]
            sup_far = a and (b["spot"] - a) >= a * dmin
            res_far = z and (z - b["spot"]) >= z * dmin

            if sup_far and (not res_far or (b["spot"] - a) <= (z - b["spot"])):
                side = "PUT"
                for off in sorted(idx_offsets(b, "PUT")):
                    leg = b["legs"].get(("PUT", off))
                    if leg and abs(leg["strike"] - a) < step / 2:
                        short_off = off
                        break
                if short_off is not None:
                    long_off = short_off - WIDTH_OFFSETS
            elif res_far:
                side = "CALL"
                for off in sorted(idx_offsets(b, "CALL")):
                    leg = b["legs"].get(("CALL", off))
                    if leg and abs(leg["strike"] - z) < step / 2:
                        short_off = off
                        break
                if short_off is not None:
                    long_off = short_off + WIDTH_OFFSETS

            if side is None or short_off is None or long_off is None:
                continue
            sc = b["legs"].get((side, short_off))
            lc = b["legs"].get((side, long_off))
            if not sc or not lc or sc["close"] <= 0:
                continue
            credit = sc["close"] - lc["close"]
            width = abs(sc["strike"] - lc["strike"])
            if credit <= 0 or width <= 0 or credit >= width:
                continue
            # minimum credit as a fraction of width — selling a 2%-of-width
            # vertical is picking pennies in front of the four-leg cost.
            if credit / width < cfg["min_credit_frac"]:
                continue
            # Reject near-degenerate risk: credit approaching the full width
            # collapses (width - credit) toward zero, which blows up R for any
            # trade regardless of real economics — this is what produced an
            # R=+65 outlier on FINNIFTY and made the whole aggregate
            # untrustworthy until this was added.
            if credit / width > cfg.get("max_credit_frac", 1.0):
                continue

            half = cfg["spread_pct"] / 2 / 100
            credit_net = credit * (1 - half)     # sell into the bid
            pos = {"side": side, "short_strike": sc["strike"], "long_strike": lc["strike"],
                   "last_sc": sc, "last_lc": lc,
                   "credit": credit, "credit_net": credit_net,
                   "risk": width - credit_net, "day": b["day"], "i": b["i"],
                   "proto": p}

    buckets = {"train": [], "valid": [], "test": []}
    for t in out:
        if t["day"] in train:
            buckets["train"].append(t)
        elif t["day"] in valid:
            buckets["valid"].append(t)
        elif t["day"] in test:
            buckets["test"].append(t)
    return {k: F.evaluate(v) for k, v in buckets.items()}, buckets


def idx_offsets(b, side):
    return [off for (s, off) in b["legs"] if s == side]


BASE = {
    "protocols": ("ALPHA",),
    "entry_from_min": F.MARKET_OPEN_MIN + 15,
    "entry_to_min": F.DAYLIGHT_REST_MIN - 30,
    "stop_mult": 1.0,        # close if the spread doubles against you
    "take_frac": 0.5,        # close at 50% of max profit
    "min_credit_frac": 0.05,
    "max_credit_frac": 0.5,
    "min_dist_pct": 0.30,
    "spread_pct": 1.0,
}


def main():
    cache = sys.argv[1] if len(sys.argv) > 1 else "index_cache.pkl"
    O.CACHE = os.path.join(O.HERE, cache)
    idxs = O.build_all()
    train, valid, test, days = O.make_splits(idxs)
    print(f"indexes {list(idxs)}   days {len(days)} ({days[0]}..{days[-1]})")

    variants = {}
    for d in (0.20, 0.30, 0.50, 0.80):
        variants[f"dist>={d}%  take50/stop2x"] = {**BASE, "min_dist_pct": d}
    variants["dist>=0.50% hold to EOD"] = {**BASE, "min_dist_pct": 0.50,
                                            "stop_mult": None, "take_frac": None}
    variants["dist>=0.50% take50 no stop"] = {**BASE, "min_dist_pct": 0.50,
                                               "stop_mult": None}
    variants["dist>=0.50% all protocols"] = {**BASE, "min_dist_pct": 0.50,
                                              "protocols": ("ALPHA", "BETA", "GAMMA")}
    for name, cfg in variants.items():
        m, buckets = spread_pnl_test(idxs, train, valid, test, cfg)
        print(f"\n=== {name} ===")
        for k in ("train", "valid", "test"):
            print(f"  {k:6s} {O.fmt(m[k])}")
        allt = sum(buckets.values(), [])
        if allt:
            by_u = {}
            for t in allt:
                by_u.setdefault(t["underlying"], []).append(t)
            for u, ts in sorted(by_u.items()):
                print(f"    {u:10s} {O.fmt(F.evaluate(ts))}")
            by_a = {}
            for t in allt:
                by_a.setdefault(t["action"], []).append(t)
            print("    exits:", {a: len(v) for a, v in sorted(by_a.items())})

    print(f"\n{'='*74}\nspread sensitivity, best-structure variant (TEST fold)\n{'='*74}")
    for sp in (0.0, 1.0, 2.0, 3.0, 5.0):
        cfg = {**BASE, "spread_pct": sp}
        m, _ = spread_pnl_test(idxs, train, valid, test, cfg)
        print(f"  spread {sp:4.1f}%  TEST {O.fmt(m['test'])}")


if __name__ == "__main__":
    main()
