#!/usr/bin/env python3
"""
Strategy optimization framework.

Design notes (why it is built this way):

* COA wall parameters (wallChallengeMarginPct, earlyOiChangeFloor,
  shiftLookback) are FROZEN at production values. Earlier analysis in this
  session measured them directly and found them inert-to-marginal, so
  searching them adds free parameters without adding signal — exactly the
  way a small sample gets curve-fitted.

* Signals are precomputed once per index, then many configs are evaluated
  against them. Only trade-management and filter parameters are searched.

* Stops/targets are checked against each bar's HIGH/LOW, not its close.
  Checking closes only both misses real intrabar stop-outs and misses real
  intrabar target hits. Where both the stop and the target fall inside the
  same bar's range, the STOP is assumed to fill first (the pessimistic,
  and for a long option the more realistic, assumption).

* The objective is expectancy in R, never win rate. Win rate is reported.
  A win-rate floor can be imposed as a CONSTRAINT, which is the honest way
  to answer "get me N% win rate" without letting the optimizer buy win rate
  with negative expectancy (tiny targets, huge stops).
"""
import json
import os
import glob
import datetime
import statistics
from collections import defaultdict

IST = datetime.timezone(datetime.timedelta(hours=5, minutes=30))
HERE = os.path.dirname(os.path.abspath(__file__))

MARKET_OPEN_MIN = 9 * 60 + 15
DAYLIGHT_REST_MIN = 15 * 60 + 15

# --- frozen production values -------------------------------------------- #
WALL_MARGIN_PCT = {"NIFTY": 15, "BANKNIFTY": 15, "FINNIFTY": 20, "BANKEX": 25, "SENSEX": 20}
OI_FLOOR = {"NIFTY": 1_000, "BANKNIFTY": 1_000, "FINNIFTY": 400, "BANKEX": 300, "SENSEX": 500}
SHIFT_LOOKBACK = {"NIFTY": 20, "BANKNIFTY": 20, "FINNIFTY": 30, "BANKEX": 35, "SENSEX": 24}
LEVEL_SHIFT_TOLERANCE = 1

INDEX_CFG = {
    "NIFTY": {"exchange": "NSE", "lotSize": 75, "strikeStep": 50,
              "invalidationPct": 0.35, "alphaBand": 0.15, "microMove": 0.05, "lookback": 20},
    "BANKNIFTY": {"exchange": "NSE", "lotSize": 15, "strikeStep": 100,
                  "invalidationPct": 0.5, "alphaBand": 0.2, "microMove": 0.07, "lookback": 20},
    "FINNIFTY": {"exchange": "NSE", "lotSize": 40, "strikeStep": 50,
                 "invalidationPct": 0.4, "alphaBand": 0.17, "microMove": 0.06, "lookback": 30},
    "BANKEX": {"exchange": "BSE", "lotSize": 30, "strikeStep": 100,
               "invalidationPct": 0.55, "alphaBand": 0.23, "microMove": 0.1, "lookback": 35},
    "SENSEX": {"exchange": "BSE", "lotSize": 20, "strikeStep": 100,
               "invalidationPct": 0.4, "alphaBand": 0.17, "microMove": 0.06, "lookback": 24},
}

NSE_RATES = dict(brokeragePerOrder=20, brokerageMaxPct=0.0025, sttSellPct=0.0015,
                 exchangePct=0.0003503, sebiPct=0.000001, ipftPct=0.000005,
                 stampBuyPct=0.00003, gstPct=0.18)
BSE_RATES = dict(brokeragePerOrder=20, brokerageMaxPct=0.0025, sttSellPct=0.0015,
                 exchangePct=0.000325, sebiPct=0.000001, ipftPct=0,
                 stampBuyPct=0.00003, gstPct=0.18)


def rates_for(u):
    return BSE_RATES if INDEX_CFG[u]["exchange"] == "BSE" else NSE_RATES


def charge_leg(side, price, qty, rates):
    turnover = price * qty
    if turnover <= 0:
        return 0.0
    brokerage = min(rates["brokeragePerOrder"], turnover * rates["brokerageMaxPct"])
    stt = turnover * rates["sttSellPct"] if side == "SELL" else 0
    stamp = turnover * rates["stampBuyPct"] if side == "BUY" else 0
    exchange = turnover * rates["exchangePct"]
    sebi = turnover * rates["sebiPct"]
    ipft = turnover * rates["ipftPct"]
    gst = (brokerage + exchange + sebi + ipft) * rates["gstPct"]
    return round(brokerage, 2) + round(stt, 2) + round(stamp, 2) + round(exchange, 2) + \
        round(sebi, 2) + round(ipft, 2) + round(gst, 2)


def day_of(ts):
    return datetime.datetime.fromtimestamp(ts, IST).date()


def session_minute(ts):
    dt = datetime.datetime.fromtimestamp(ts, IST)
    return dt.hour * 60 + dt.minute


def strike_label(off):
    return "ATM" if off == 0 else f"ATM{'+' if off > 0 else ''}{off}"


def find_leg(bar, side, strike, step):
    """Locate a leg by its ABSOLUTE strike.

    Dhan's rolling-option series is strike-*relative*: offset ATM+1 is a
    different contract on every bar the ATM anchor moves. Holding a position
    by offset therefore silently swaps the instrument underneath the trade
    whenever spot crosses a strike — which, over a 60-minute hold, is common.
    Every open position is tracked by absolute strike through this helper;
    when the strike drifts outside the fetched ATM +/- band it is no longer
    observable and the caller must close, rather than pretend.
    """
    best = None
    for (s, off), leg in bar["legs"].items():
        if s != side:
            continue
        if abs(leg["strike"] - strike) < step / 2:
            return leg, off
    return best, None


# ------------------------------------------------------------------ loader #

def load_deep(underlying, offsets, data_dir="deep_data"):
    """Merge the windowed pulls into one continuous series per (side, offset),
    de-duplicated and sorted by timestamp."""
    out = {}
    for opt in ["CALL", "PUT"]:
        for off in offsets:
            pat = os.path.join(HERE, data_dir, f"{underlying}_{strike_label(off)}_{opt}_*.json")
            merged = {}
            for path in sorted(glob.glob(pat)):
                try:
                    with open(path) as f:
                        d = json.load(f)
                except Exception:
                    continue
                node = (d.get("data") or {}).get("ce" if opt == "CALL" else "pe")
                if not node or not node.get("timestamp"):
                    continue
                ts = node["timestamp"]
                for k, t in enumerate(ts):
                    merged[t] = {
                        "oi": node["oi"][k] if k < len(node.get("oi", [])) else 0,
                        "strike": node["strike"][k] if k < len(node.get("strike", [])) else 0,
                        "spot": node["spot"][k] if k < len(node.get("spot", [])) else 0,
                        "close": node["close"][k] if k < len(node.get("close", [])) else 0,
                        "high": node["high"][k] if k < len(node.get("high", [])) else 0,
                        "low": node["low"][k] if k < len(node.get("low", [])) else 0,
                        "iv": node["iv"][k] if k < len(node.get("iv", [])) else 0,
                    }
            if merged:
                out[(opt, off)] = merged
    return out


def build_index(underlying, offsets, data_dir="deep_data"):
    """Precompute every signal that does not depend on searched parameters."""
    raw = load_deep(underlying, offsets, data_dir)
    if not raw:
        return None
    # common timeline = timestamps present in the ATM CALL series
    anchor = raw.get(("CALL", 0))
    if not anchor:
        return None
    ts_list = sorted(anchor.keys())

    cfg = INDEX_CFG[underlying]
    step = cfg["strikeStep"]
    margin = WALL_MARGIN_PCT[underlying]
    floor = OI_FLOOR[underlying]
    shift_lb = SHIFT_LOOKBACK[underlying]

    n = len(ts_list)
    bars = []
    baseline = {}
    cur_day = None
    aegis1 = zenith1 = None
    aegis0_fb = zenith0_fb = None
    aegis_hist, zenith_hist = [], []
    spot_window = []
    day_open = None
    price_sum, price_n = 0.0, 0

    for i, ts in enumerate(ts_list):
        day = day_of(ts)
        if day != cur_day:
            cur_day = day
            aegis1 = zenith1 = None
            aegis_hist, zenith_hist = [], []
            spot_window = []
            day_open = None
            price_sum, price_n = 0.0, 0
            for key in raw:
                baseline[key] = raw[key].get(ts, {}).get("oi")

        spot = anchor[ts]["spot"]
        if spot <= 0:
            bars.append(None)
            continue
        if day_open is None:
            day_open = spot
        price_sum += spot
        price_n += 1
        vwap_proxy = price_sum / price_n
        intraday_ret = (spot - day_open) / day_open * 100

        spot_window.append(spot)
        if len(spot_window) > max(cfg["lookback"], 12):
            spot_window = spot_window[-max(cfg["lookback"], 12):]

        put_c, call_c = [], []
        rp, rc = (None, -1), (None, -1)
        legs = {}
        tot_p_oi = tot_c_oi = 0
        for (opt, off), series in raw.items():
            rec = series.get(ts)
            if not rec:
                continue
            legs[(opt, off)] = rec
            oi, strike = rec["oi"], rec["strike"]
            base = baseline.get((opt, off))
            chg = (oi - base) if base is not None else 0
            if opt == "PUT":
                tot_p_oi += oi
                if strike <= spot:
                    if oi > rp[1]:
                        rp = (strike, oi)
                    if chg >= floor:
                        put_c.append((strike, chg))
            else:
                tot_c_oi += oi
                if strike >= spot:
                    if oi > rc[1]:
                        rc = (strike, oi)
                    if chg >= floor:
                        call_c.append((strike, chg))

        aegis0_fb = rp[0] if rp[1] > 0 else aegis0_fb
        zenith0_fb = rc[0] if rc[1] > 0 else zenith0_fb

        def challenge(inc, cands):
            if not cands:
                return inc
            best = max(cands, key=lambda c: c[1])
            if inc is None or best[0] == inc:
                return best[0]
            incv = next((c[1] for c in cands if c[0] == inc), 0)
            return best[0] if best[1] > incv * (1 + margin / 100) else inc

        aegis1 = challenge(aegis1, put_c) or aegis0_fb
        zenith1 = challenge(zenith1, call_c) or zenith0_fb
        if aegis1:
            aegis_hist.append(aegis1)
        if zenith1:
            zenith_hist.append(zenith1)

        def shift(h):
            if len(h) < 2 or step <= 0:
                return 0
            lb = min(len(h) - 1, shift_lb)
            return round((h[-1] - h[-1 - lb]) / step)

        a_sh, z_sh = shift(aegis_hist), shift(zenith_hist)
        protocol = None
        if aegis1 and zenith1:
            ss = abs(a_sh) <= LEVEL_SHIFT_TOLERANCE
            rs = abs(z_sh) <= LEVEL_SHIFT_TOLERANCE
            if ss and rs:
                protocol = "ALPHA"
            elif ss and z_sh > LEVEL_SHIFT_TOLERANCE:
                protocol = "BETA"
            elif rs and a_sh < -LEVEL_SHIFT_TOLERANCE:
                protocol = "GAMMA"
            else:
                protocol = "DELTA"

        band = cfg["alphaBand"] / 100
        near_sup = bool(aegis1 and abs(spot - aegis1) <= aegis1 * band)
        near_res = bool(zenith1 and abs(spot - zenith1) <= zenith1 * band)

        mm = cfg["microMove"]
        dip = len(spot_window) >= 2 and spot <= max(spot_window) * (1 - mm / 100)
        rally = len(spot_window) >= 2 and spot >= min(spot_window) * (1 + mm / 100)

        if len(spot_window) >= 2:
            mean_w = sum(spot_window) / len(spot_window)
            chop = (max(spot_window) - min(spot_window)) / mean_w * 100 if mean_w > 0 else 0
        else:
            chop = 0

        pcr = (tot_p_oi / tot_c_oi) if tot_c_oi > 0 else 1.0

        atm_ce = legs.get(("CALL", 0)) or {}
        atm_pe = legs.get(("PUT", 0)) or {}
        ivs = [v for v in (atm_ce.get("iv"), atm_pe.get("iv")) if v and v > 0]
        atm_iv = sum(ivs) / len(ivs) if ivs else 0.0

        bars.append({
            "i": i, "ts": ts, "day": day, "smin": session_minute(ts), "spot": spot,
            "aegis1": aegis1, "zenith1": zenith1, "protocol": protocol,
            "near_sup": near_sup, "near_res": near_res, "dip": dip, "rally": rally,
            "chop": chop, "intraday_ret": intraday_ret, "vwap_gap": spot - vwap_proxy,
            "pcr": pcr, "atm_iv": atm_iv, "legs": legs,
        })

    # Trailing IV percentile — where the current ATM IV sits inside its own
    # recent distribution. Buying premium into the top of that distribution is
    # structurally unattractive (you pay for vol that mean-reverts against a
    # long option), so this is worth having as a searchable entry filter.
    IV_WINDOW = 500
    recent = []
    for b in bars:
        if b is None:
            continue
        iv = b["atm_iv"]
        if iv > 0:
            if recent:
                b["iv_pctile"] = sum(1 for v in recent if v <= iv) / len(recent)
            else:
                b["iv_pctile"] = 0.5
            recent.append(iv)
            if len(recent) > IV_WINDOW:
                recent.pop(0)
        else:
            b["iv_pctile"] = 0.5

    return {"underlying": underlying, "ts": ts_list, "bars": bars, "cfg": cfg,
            "rates": rates_for(underlying)}


# ------------------------------------------------------------------- engine #

DEFAULT_CFG = {
    "protocols": ("ALPHA", "BETA", "GAMMA"),
    "stop_pct": 0.25,
    "target_r": 1.5,
    "max_hold_bars": None,
    "trend_align": False,
    "chop_filter": True,
    "dwell": 3,
    "entry_from_min": MARKET_OPEN_MIN + 10,
    "entry_to_min": DAYLIGHT_REST_MIN,
    "depths": (2, 3),
    "use_invalidation": True,
    "breakeven_at_r": None,   # move stop to entry once this many R in profit
    # Round-trip bid-ask cost as a percent of premium: buy at the offer, sell
    # at the bid. Charged half at entry, half at exit. This is NOT a
    # second-order detail here — at a 0.25R target the whole gross gain is
    # only (0.25 * stop_pct) of premium, so a 1% spread can eat a double-digit
    # percentage of every winner. Every headline number must state its
    # assumption for this.
    "spread_pct": 0.0,
    "pcr_rule": False,
    "iv_max_pctile": None,
    "invert_direction": False,
    # Passive limit entry instead of a marketable order: place the order
    # this many percent BELOW the current mid and wait up to
    # limit_timeout_bars for a future bar's low to actually trade there. A
    # limit that never fills means no trade, not a worse trade — this tests
    # execution quality as its own lever, independent of the entry signal
    # itself. 0 reproduces the old marketable-order behaviour exactly.
    "limit_discount_pct": 0.0,
    "limit_timeout_bars": 3,
    "fill_buffer_pct": 0.0,
    # Exit the instant the SAME classification that justified the entry no
    # longer holds — protocol flipped away, or (for Alpha) spot is no longer
    # near the wall it was bought at — rather than waiting for price to
    # travel the full invalidationPct band. This directly targets the
    # winners-resolve-in-1-bar / losers-take-13-bars asymmetry found in the
    # very first diagnosis: a losing trade whose thesis has already broken
    # sits there un-exited for a long time under the old logic.
    "thesis_exit": False,
    # A tighter, position-specific band on the position's OWN anchor wall
    # (aegis1 for a CE long, zenith1 for a PE long) moving away from where
    # it was at entry — independent of protocol classification, and
    # deliberately smaller than invalidationPct so it can fire earlier.
    # None disables it.
    "thesis_wall_pct": None,
}


def simulate_index(idx, cfg):
    """Run one config over one index; returns a list of trades in R units.
    Position sizing is deliberately excluded here — R-space keeps the signal
    question separate from the capital-allocation question."""
    if idx is None:
        return []
    bars = idx["bars"]
    icfg = idx["cfg"]
    rates = idx["rates"]
    trades = []
    pos = None
    pending = None    # a placed-but-not-yet-filled limit order
    dwell_key, dwell_n = None, 0
    last_exit_i = -1

    for b in bars:
        if b is None:
            continue

        # ---------------- pending limit order ---------------- #
        if pending is not None:
            leg = b["legs"].get((pending["side_key"], pending["off"]))
            # A bar's low merely touching the limit price is an optimistic
            # fill assumption (infinite size, no queue priority, no adverse
            # selection). fill_buffer_pct requires the market to trade
            # MEANINGFULLY through the limit, not just wick it, as a crude
            # stand-in for "enough volume traded there that a resting order
            # likely got filled" — sensitivity-tested deliberately, since
            # limit-fill backtests are a well-known place results overstate
            # real edge.
            buf = cfg.get("fill_buffer_pct", 0.0) / 100
            fill_trigger = pending["limit_price"] * (1 - buf)
            filled = leg is not None and leg["low"] > 0 and leg["low"] <= fill_trigger
            expired = (b["i"] - pending["placed_i"]) >= cfg["limit_timeout_bars"] \
                or b["day"] != pending["day"] or b["smin"] >= DAYLIGHT_REST_MIN
            if filled:
                entry = pending["limit_price"]
                stop_pts = entry * cfg["stop_pct"]
                be_trigger = (entry + stop_pts * cfg["breakeven_at_r"]) if cfg["breakeven_at_r"] else None
                pos = {
                    "i": b["i"], "day": pending["day"], "proto": pending["proto"],
                    "opt": pending["opt"], "off": pending["off"], "strike": pending["strike"],
                    "last_leg": leg, "side_key": pending["side_key"], "entry": entry,
                    "stop_pts": stop_pts, "stop": max(0.05, entry - stop_pts),
                    "target": entry + stop_pts * cfg["target_r"],
                    "be_trigger": be_trigger, "be_armed": False,
                }
                pending = None
            elif expired:
                pending = None
                dwell_key, dwell_n = None, 0

        # ---------------- exit ---------------- #
        if pos is not None:
            leg, _off = find_leg(b, pos["side_key"], pos["strike"], icfg["strikeStep"])
            if leg is None:
                # The contract drifted outside the fetched strike band; it is
                # no longer observable, so close at the last price we saw
                # rather than invent one.
                leg = pos["last_leg"]
            else:
                pos["last_leg"] = leg
            hi = leg["high"] if leg and leg["high"] > 0 else (leg["close"] if leg else pos["entry"])
            lo = leg["low"] if leg and leg["low"] > 0 else (leg["close"] if leg else pos["entry"])
            close = leg["close"] if leg and leg["close"] > 0 else pos["entry"]
            action, fill = None, None

            if lo <= pos["stop"]:
                action, fill = "STOP", pos["stop"]
            elif hi >= pos["target"]:
                action, fill = "TARGET", pos["target"]
            else:
                if pos["be_armed"] is False and pos["be_trigger"] is not None \
                        and hi >= pos["be_trigger"]:
                    pos["stop"] = pos["entry"]
                    pos["be_armed"] = True
                if cfg["use_invalidation"]:
                    inv = icfg["invalidationPct"] / 100
                    if pos["opt"] == "CE" and b["aegis1"] and b["spot"] < b["aegis1"] * (1 - inv):
                        action, fill = "INVALIDATION", close
                    elif pos["opt"] == "PE" and b["zenith1"] and b["spot"] > b["zenith1"] * (1 + inv):
                        action, fill = "INVALIDATION", close
                if action is None and cfg.get("thesis_exit"):
                    # Same classification the entry required, re-checked live.
                    still_alpha_ce = pos["proto"] == "ALPHA" and pos["opt"] == "CE" and b["near_sup"]
                    still_alpha_pe = pos["proto"] == "ALPHA" and pos["opt"] == "PE" and b["near_res"]
                    still_beta = pos["proto"] == "BETA" and b["protocol"] == "BETA"
                    still_gamma = pos["proto"] == "GAMMA" and b["protocol"] == "GAMMA"
                    thesis_intact = still_alpha_ce or still_alpha_pe or still_beta or still_gamma
                    if not thesis_intact:
                        action, fill = "THESIS_BROKEN", close
                if action is None and cfg.get("thesis_wall_pct") is not None:
                    twp = cfg["thesis_wall_pct"] / 100
                    if pos["opt"] == "CE" and b["aegis1"] and b["spot"] < b["aegis1"] * (1 - twp):
                        action, fill = "THESIS_WALL", close
                    elif pos["opt"] == "PE" and b["zenith1"] and b["spot"] > b["zenith1"] * (1 + twp):
                        action, fill = "THESIS_WALL", close
                if action is None and cfg["max_hold_bars"] is not None \
                        and (b["i"] - pos["i"]) >= cfg["max_hold_bars"]:
                    action, fill = "TIME", close
                if action is None and b["smin"] >= DAYLIGHT_REST_MIN:
                    action, fill = "DAYLIGHT", close
                if action is None and b["day"] != pos["day"]:
                    action, fill = "DAYLIGHT", close

            if action:
                qty = icfg["lotSize"]
                # Cross the spread on the way out too: a stop/target level is
                # where the mid trades through, the fill is worse by half the
                # spread. `pos["entry"]` already carries the entry-side half.
                half = cfg.get("spread_pct", 0.0) / 2 / 100
                fill = fill * (1 - half)
                c_in = charge_leg("BUY", pos["entry"], qty, rates)
                c_out = charge_leg("SELL", fill, qty, rates)
                gross = (fill - pos["entry"]) * qty
                net = gross - c_in - c_out
                r = net / (pos["stop_pts"] * qty) if pos["stop_pts"] > 0 else 0
                trades.append({
                    "underlying": idx["underlying"], "protocol": pos["proto"],
                    "opt": pos["opt"], "action": action, "r": r, "net": net,
                    "day": pos["day"], "hold": b["i"] - pos["i"],
                    "entry": pos["entry"],
                })
                pos = None
                last_exit_i = b["i"]
                dwell_key, dwell_n = None, 0

        if pos is not None or pending is not None:
            continue

        # No same-bar turnaround. The exit above is priced off this bar's
        # high/low and an entry would be priced off its close — and there is
        # no way to know from a 5-min bar that the extreme preceded the
        # close. Waiting one bar removes the ambiguity.
        if b["i"] <= last_exit_i:
            continue

        # ---------------- entry ---------------- #
        p = b["protocol"]
        if p is None or p == "DELTA" or p not in cfg["protocols"]:
            dwell_key, dwell_n = None, 0
            continue
        if not (cfg["entry_from_min"] <= b["smin"] < cfg["entry_to_min"]):
            dwell_key, dwell_n = None, 0
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
            dwell_key, dwell_n = None, 0
            continue

        # Diagnostic/strategy flag, not a curve-fit knob: the baseline takes
        # stops vs targets at a rate WORSE than the ~60/40 a zero-edge entry
        # would produce at 1:1.5 R:R, which is evidence the entry carries
        # real information with the sign reversed. Flipping the side tests
        # that directly. (Still a long option either way — this is not the
        # same as writing the contract, which the engine cannot do.)
        if cfg.get("invert_direction"):
            opt = "PE" if opt == "CE" else "CE"

        if cfg["chop_filter"] and p in ("BETA", "GAMMA"):
            floor_chop = {"NIFTY": 0.10, "BANKNIFTY": 0.14, "FINNIFTY": 0.12,
                          "BANKEX": 0.16, "SENSEX": 0.12}[idx["underlying"]]
            if b["chop"] < floor_chop:
                dwell_key, dwell_n = None, 0
                continue

        if cfg["trend_align"]:
            if opt == "CE" and b["intraday_ret"] < 0:
                dwell_key, dwell_n = None, 0
                continue
            if opt == "PE" and b["intraday_ret"] > 0:
                dwell_key, dwell_n = None, 0
                continue

        # PCR directional agreement — the user's own spec rule: a bullish
        # (CE) thesis wants put writers in control, a bearish (PE) thesis
        # wants call writers in control.
        if cfg.get("pcr_rule"):
            if opt == "CE" and b["pcr"] <= 1.0:
                dwell_key, dwell_n = None, 0
                continue
            if opt == "PE" and b["pcr"] >= 1.0:
                dwell_key, dwell_n = None, 0
                continue

        # Don't buy premium into the top of its own recent IV distribution.
        if cfg.get("iv_max_pctile") is not None and b.get("iv_pctile", 0.5) > cfg["iv_max_pctile"]:
            dwell_key, dwell_n = None, 0
            continue

        key = f"{p}:{opt}"
        if dwell_key == key:
            dwell_n += 1
        else:
            dwell_key, dwell_n = key, 1
        if dwell_n < cfg["dwell"]:
            continue

        side_key = "CALL" if opt == "CE" else "PUT"
        chosen = None
        for d in cfg["depths"]:
            off = -d if opt == "CE" else d
            leg = b["legs"].get((side_key, off))
            if leg and leg["close"] > 0:
                chosen = (off, leg["close"], leg["strike"], leg)
                break
        if chosen is None:
            continue

        off, entry_mid, entry_strike, entry_leg = chosen

        if cfg.get("limit_discount_pct", 0.0) > 0:
            # Passive order: quote below the current mid and wait for price
            # to actually come to it, rather than paying the offer now.
            limit_price = entry_mid * (1 - cfg["limit_discount_pct"] / 100)
            pending = {
                "placed_i": b["i"], "day": b["day"], "proto": p, "opt": opt,
                "off": off, "strike": entry_strike, "side_key": side_key,
                "limit_price": limit_price,
            }
            continue

        # Buy at the offer, not the mid.
        entry = entry_mid * (1 + cfg.get("spread_pct", 0.0) / 2 / 100)
        stop_pts = entry * cfg["stop_pct"]
        be_trigger = (entry + stop_pts * cfg["breakeven_at_r"]) \
            if cfg["breakeven_at_r"] else None
        pos = {
            "i": b["i"], "day": b["day"], "proto": p, "opt": opt, "off": off,
            "strike": entry_strike, "last_leg": entry_leg,
            "side_key": side_key, "entry": entry, "stop_pts": stop_pts,
            "stop": max(0.05, entry - stop_pts),
            "target": entry + stop_pts * cfg["target_r"],
            "be_trigger": be_trigger, "be_armed": False,
        }

    return trades


def evaluate(trades):
    n = len(trades)
    if n == 0:
        return {"n": 0, "win_rate": None, "expectancy_r": None, "total_r": 0,
                "profit_factor": None, "avg_win_r": None, "avg_loss_r": None}
    wins = [t["r"] for t in trades if t["r"] > 0]
    losses = [t["r"] for t in trades if t["r"] <= 0]
    gross_win = sum(wins)
    gross_loss = abs(sum(losses))
    return {
        "n": n,
        "win_rate": len(wins) / n * 100,
        "expectancy_r": sum(t["r"] for t in trades) / n,
        "total_r": sum(t["r"] for t in trades),
        "profit_factor": (gross_win / gross_loss) if gross_loss > 0 else float("inf"),
        "avg_win_r": (gross_win / len(wins)) if wins else 0,
        "avg_loss_r": (-gross_loss / len(losses)) if losses else 0,
    }
