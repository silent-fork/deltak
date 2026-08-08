#!/usr/bin/env python3
"""
Full rupee P&L backtest: the winning combo (limit entry + thesis-exit) run
through REAL position sizing under the shipped config, not R-space.

Shipped config (from lib/engine/config.ts, already committed this session):
  paperCapital=100,000  riskPct=15  maxConcurrentPositions=3
  maxPositionCapitalPct=60  maxPortfolioRiskPct=20

Merges backtest_pnl.py's portfolio/capital engine (shared wallet across all
5 indexes, real charges, real lot sizing) with framework.py's new pending
limit-order and thesis-exit logic (verified in R-space already). Sizing is
computed at FILL time off the actual limit price, not at signal time off
the mid — a limit order's whole point is a better entry price, so sizing
has to see the price it actually paid.
"""
import os
import optimize as O
import framework as F

CAPITAL0 = 100_000.0
RISK_PCT = 15.0
MAX_CONCURRENT_POSITIONS = 3
MAX_POSITION_CAPITAL_PCT = 60
MAX_PORTFOLIO_RISK_PCT = 20


# Real markets have finite depth — you cannot keep deploying a fixed
# PERCENTAGE of an ever-growing account into a single index option strike
# without moving the market yourself, which this backtest (like every
# backtest in this session) does not model. Uncapped fixed-fractional
# sizing compounded over hundreds of trades produces numbers in the tens of
# millions that are a mathematical artifact of the sizing formula, not a
# trading result — confirmed directly: one single trade at uncapped sizing
# netted -Rs 959,846, another +Rs 6.45 million, once capital had compounded
# into the millions. Capping the RISK-PCT SIZING BASE at a multiple of
# starting capital reflects what a real trader/risk desk would actually do
# (bank growth past a ceiling rather than keep re-risking all of it) and is
# the only way this number means anything.
SIZING_CAPITAL_CAP_MULT = 5.0  # sizing base frozen once equity exceeds 5x start


def calculate_size(underlying, stop_points, capital, entry_price, max_deployable):
    lot = F.INDEX_CFG[underlying]["lotSize"]
    sizing_base = min(capital, CAPITAL0 * SIZING_CAPITAL_CAP_MULT)
    risk_amount = sizing_base * (RISK_PCT / 100)
    risk_per_lot = max(0, stop_points) * lot
    if risk_per_lot <= 0 or entry_price <= 0:
        return 0
    lots = int(risk_amount // risk_per_lot)
    if lots <= 0:
        return 0
    budget = min(max_deployable, capital * (MAX_POSITION_CAPITAL_PCT / 100))
    cost_per_lot = entry_price * lot
    affordable = int(budget // cost_per_lot) if cost_per_lot > 0 else 0
    return max(0, min(lots, affordable))


def run(idxs, underlyings, cfg, train, valid, test):
    states = {u: {"pending": None, "dwell_key": None, "dwell_n": 0, "last_exit_i": -1}
              for u in underlyings}
    open_positions = {}   # underlying -> pos dict
    capital = CAPITAL0
    trades = []
    equity_by_day = []

    n = min(len(idxs[u]["bars"]) for u in underlyings)
    for i in range(n):
        day_marker = None
        for u in underlyings:
            b = idxs[u]["bars"][i]
            if b is not None:
                day_marker = b["day"]
                break

        # ---- fill checks + exits ----
        for u in underlyings:
            idx = idxs[u]
            icfg = F.INDEX_CFG[u]
            step = icfg["strikeStep"]
            lot = icfg["lotSize"]
            rates = idx["rates"]
            st = states[u]
            b = idx["bars"][i]
            if b is None:
                continue

            # pending limit fill
            p = st["pending"]
            if p is not None:
                leg = b["legs"].get((p["side_key"], p["off"]))
                buf = cfg.get("fill_buffer_pct", 0.0) / 100
                trigger = p["limit_price"] * (1 - buf)
                filled = leg is not None and leg["low"] > 0 and leg["low"] <= trigger
                expired = (i - p["placed_i"]) >= cfg["limit_timeout_bars"] \
                    or b["day"] != p["day"] or b["smin"] >= F.DAYLIGHT_REST_MIN
                if filled and u not in open_positions and len(open_positions) < MAX_CONCURRENT_POSITIONS:
                    entry = p["limit_price"]
                    stop_pts = entry * cfg["stop_pct"]
                    committed_risk = sum(pp["stop_pts"] * pp["lots"] * F.INDEX_CFG[pu]["lotSize"]
                                          for pu, pp in open_positions.items())
                    risk_budget = min(capital, CAPITAL0 * SIZING_CAPITAL_CAP_MULT) * (MAX_PORTFOLIO_RISK_PCT / 100)
                    lots = calculate_size(u, stop_pts, capital, entry, capital)
                    if lots > 0:
                        this_risk = stop_pts * lots * lot
                        if committed_risk + this_risk > risk_budget:
                            scale = max(0, (risk_budget - committed_risk) / this_risk) if this_risk > 0 else 0
                            lots = int(lots * scale)
                    if lots > 0:
                        qty = lots * lot
                        entry_cost = entry * qty
                        entry_charge = F.charge_leg("BUY", entry, qty, rates)
                        capital -= (entry_cost + entry_charge)
                        open_positions[u] = {
                            "proto": p["proto"], "opt": p["opt"], "off": p["off"],
                            "strike": p["strike"], "side_key": p["side_key"],
                            "entry": entry, "stop_pts": stop_pts,
                            "stop": max(0.05, entry - stop_pts),
                            "target": entry + stop_pts * cfg["target_r"],
                            "lots": lots, "i": i, "day": p["day"], "last_leg": leg,
                        }
                    st["pending"] = None
                elif filled:
                    st["pending"] = None  # couldn't size/afford it — drop, don't retry same signal
                elif expired:
                    st["pending"] = None
                    st["dwell_key"], st["dwell_n"] = None, 0

            # exit
            pos = open_positions.get(u)
            if pos is not None:
                leg, _ = F.find_leg(b, pos["side_key"], pos["strike"], step)
                if leg is None:
                    leg = pos["last_leg"]
                else:
                    pos["last_leg"] = leg
                hi = leg["high"] if leg["high"] > 0 else leg["close"]
                lo = leg["low"] if leg["low"] > 0 else leg["close"]
                close = leg["close"] if leg["close"] > 0 else pos["entry"]
                action, fill = None, None

                if lo <= pos["stop"]:
                    action, fill = "STOP", pos["stop"]
                elif hi >= pos["target"]:
                    action, fill = "TARGET", pos["target"]
                else:
                    inv = icfg["invalidationPct"] / 100
                    if pos["opt"] == "CE" and b["aegis1"] and b["spot"] < b["aegis1"] * (1 - inv):
                        action, fill = "INVALIDATION", close
                    elif pos["opt"] == "PE" and b["zenith1"] and b["spot"] > b["zenith1"] * (1 + inv):
                        action, fill = "INVALIDATION", close
                    if action is None and cfg.get("thesis_exit"):
                        still_alpha_ce = pos["proto"] == "ALPHA" and pos["opt"] == "CE" and b["near_sup"]
                        still_alpha_pe = pos["proto"] == "ALPHA" and pos["opt"] == "PE" and b["near_res"]
                        still_beta = pos["proto"] == "BETA" and b["protocol"] == "BETA"
                        still_gamma = pos["proto"] == "GAMMA" and b["protocol"] == "GAMMA"
                        if not (still_alpha_ce or still_alpha_pe or still_beta or still_gamma):
                            action, fill = "THESIS_BROKEN", close
                    if action is None and b["smin"] >= F.DAYLIGHT_REST_MIN:
                        action, fill = "DAYLIGHT", close
                    if action is None and b["day"] != pos["day"]:
                        action, fill = "DAYLIGHT", close

                if action:
                    qty = pos["lots"] * lot
                    half = cfg["spread_pct"] / 2 / 100
                    exit_price = fill * (1 - half)
                    exit_charge = F.charge_leg("SELL", exit_price, qty, rates)
                    entry_charge = F.charge_leg("BUY", pos["entry"], qty, rates)
                    net = (exit_price - pos["entry"]) * qty - entry_charge - exit_charge
                    capital += exit_price * qty - exit_charge
                    trades.append({"underlying": u, "day": pos["day"], "action": action,
                                    "net": net, "protocol": pos["proto"],
                                    "entry": pos["entry"], "stop_pts": pos["stop_pts"], "lots": pos["lots"],
                                    "opt": pos["opt"], "strike": pos["strike"], "exit_price": exit_price,
                                    "entry_charge": entry_charge, "exit_charge": exit_charge,
                                    "stop": pos["stop"], "target": pos["target"]})
                    del open_positions[u]
                    st["last_exit_i"] = i
                    st["dwell_key"], st["dwell_n"] = None, 0

        # ---- entries (place new limit orders) ----
        for u in underlyings:
            st = states[u]
            if u in open_positions or st["pending"] is not None:
                continue
            b = idxs[u]["bars"][i]
            if b is None or i <= st["last_exit_i"]:
                continue
            p = b["protocol"]
            if p is None or p == "DELTA" or p not in cfg["protocols"]:
                st["dwell_key"], st["dwell_n"] = None, 0
                continue
            if not (cfg["entry_from_min"] <= b["smin"] < cfg["entry_to_min"]):
                st["dwell_key"], st["dwell_n"] = None, 0
                continue

            opt = None
            if p == "ALPHA":
                if b["near_sup"] and not b["near_res"]:
                    opt = "CE"
                elif b["near_res"] and not b["near_sup"]:
                    opt = "PE"
            elif p == "BETA":
                if b["dip"]:
                    opt = "CE"
            elif p == "GAMMA":
                if b["rally"]:
                    opt = "PE"
            if opt is None:
                st["dwell_key"], st["dwell_n"] = None, 0
                continue

            if cfg["chop_filter"] and p in ("BETA", "GAMMA"):
                floor_chop = {"NIFTY": 0.10, "BANKNIFTY": 0.14, "FINNIFTY": 0.12,
                              "BANKEX": 0.16, "SENSEX": 0.12}[u]
                if b["chop"] < floor_chop:
                    st["dwell_key"], st["dwell_n"] = None, 0
                    continue

            key = f"{p}:{opt}"
            if st["dwell_key"] == key:
                st["dwell_n"] += 1
            else:
                st["dwell_key"], st["dwell_n"] = key, 1
            if st["dwell_n"] < cfg["dwell"]:
                continue

            side_key = "CALL" if opt == "CE" else "PUT"
            chosen = None
            for d in cfg["depths"]:
                off = -d if opt == "CE" else d
                leg = b["legs"].get((side_key, off))
                if leg and leg["close"] > 0:
                    chosen = (off, leg["close"], leg["strike"])
                    break
            if chosen is None:
                continue
            off, entry_mid, strike = chosen
            limit_price = entry_mid * (1 - cfg["limit_discount_pct"] / 100)
            states[u]["pending"] = {"placed_i": i, "day": b["day"], "proto": p, "opt": opt,
                                     "off": off, "strike": strike, "side_key": side_key,
                                     "limit_price": limit_price}

        if day_marker is not None:
            mtm = capital + sum(
                (open_positions[u]["last_leg"]["close"] if open_positions[u]["last_leg"]["close"] > 0
                 else open_positions[u]["entry"]) * open_positions[u]["lots"] * F.INDEX_CFG[u]["lotSize"]
                for u in open_positions
            )
            equity_by_day.append((day_marker, mtm))

    # force-close anything open at the end
    for u, pos in list(open_positions.items()):
        rates = idxs[u]["rates"]
        lot = F.INDEX_CFG[u]["lotSize"]
        qty = pos["lots"] * lot
        exit_price = pos["last_leg"]["close"] if pos["last_leg"]["close"] > 0 else pos["entry"]
        exit_charge = F.charge_leg("SELL", exit_price, qty, rates)
        entry_charge = F.charge_leg("BUY", pos["entry"], qty, rates)
        net = (exit_price - pos["entry"]) * qty - entry_charge - exit_charge
        capital += exit_price * qty - exit_charge
        trades.append({"underlying": u, "day": pos["day"], "action": "FORCED_CLOSE",
                        "net": net, "protocol": pos["proto"],
                        "entry": pos["entry"], "stop_pts": pos.get("stop_pts", 0), "lots": pos["lots"],
                        "opt": pos["opt"], "strike": pos["strike"], "exit_price": exit_price,
                        "entry_charge": entry_charge, "exit_charge": exit_charge,
                        "stop": pos.get("stop"), "target": pos.get("target")})

    return capital, trades, equity_by_day


def summarize(label, capital, trades, split_days=None):
    n = len(trades)
    wins = [t for t in trades if t["net"] > 0]
    losses = [t for t in trades if t["net"] <= 0]
    pnl = capital - CAPITAL0
    print(f"\n=== {label} ===")
    print(f"  final capital: Rs {capital:,.2f}  (P&L {pnl:+,.2f}, {pnl/CAPITAL0*100:+.1f}%)")
    if n:
        print(f"  trades: {n}  win rate {len(wins)/n*100:.1f}%")
    by_u = {}
    for t in trades:
        by_u.setdefault(t["underlying"], []).append(t["net"])
    for u, ns in sorted(by_u.items()):
        wr = sum(1 for x in ns if x > 0) / len(ns) * 100
        print(f"    {u:10s} n={len(ns):3d} pnl={sum(ns):+10,.2f} win_rate={wr:.0f}%")
    if split_days:
        for name, days in split_days:
            sub = [t for t in trades if t["day"] in days]
            if sub:
                sub_pnl = sum(t["net"] for t in sub)
                wr = sum(1 for t in sub if t["net"] > 0) / len(sub) * 100
                print(f"  {name:6s}: n={len(sub):4d}  pnl={sub_pnl:+10,.2f}  win_rate={wr:.1f}%")


if __name__ == "__main__":
    O.CACHE = os.path.join(O.HERE, "index_cache.pkl")
    idxs = O.build_all()
    train, valid, test, days = O.make_splits(idxs)
    underlyings = list(idxs.keys())

    old_cfg = dict(F.DEFAULT_CFG)
    old_cfg["spread_pct"] = 1.0
    old_cfg["limit_discount_pct"] = 0.0
    old_cfg["thesis_exit"] = False
    cap, trades, _ = run(idxs, underlyings, old_cfg, train, valid, test)
    summarize("OLD (marketable entry, fixed-stop exit) — real Rs sizing", cap, trades,
              [("train", train), ("valid", valid), ("test", test)])

    new_cfg = dict(F.DEFAULT_CFG)
    new_cfg["spread_pct"] = 1.0
    new_cfg["limit_discount_pct"] = 3.0
    new_cfg["limit_timeout_bars"] = 3
    new_cfg["thesis_exit"] = True
    cap2, trades2, curve2 = run(idxs, underlyings, new_cfg, train, valid, test)
    summarize("NEW (limit entry 3.0% + thesis-exit) — real Rs sizing", cap2, trades2,
              [("train", train), ("valid", valid), ("test", test)])
