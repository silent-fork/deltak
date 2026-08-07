#!/usr/bin/env python3
"""
Deep historical pull for strategy optimization — 18 months, 5 indexes,
ATM-5..ATM+5, both sides, 5-min bars, full OHLC + OI + IV + volume.

Why deeper than the earlier 45-day pull: any parameter search over a
28-trade sample is curve-fitting, not optimization. This gets the sample
into a range where a train/validation/test split is meaningful.

OHLC matters specifically because stop/target fills should be checked
against each bar's high/low, not its close — checking closes only both
misses real intrabar stop-outs and misses real intrabar target hits.

Resumable: every (index, offset, side, window) is its own file and
existing files are skipped, so a re-run picks up where it stopped.
"""
import json
import os
import sys
import time
import datetime
import requests

TOKEN = os.environ["DHAN_ToKEN"]
CLIENT_ID = os.environ["DHAN_CLIENT_ID"]
URL = "https://api.dhan.co/v2/charts/rollingoption"

UNDERLYINGS = {
    "NIFTY": ("13", "NSE_FNO"),
    "BANKNIFTY": ("25", "NSE_FNO"),
    "FINNIFTY": ("27", "NSE_FNO"),
    "SENSEX": ("51", "BSE_FNO"),
    "BANKEX": ("69", "BSE_FNO"),
}

OFFSETS = list(range(-5, 6))
OUT_DIR = os.path.join(os.path.dirname(__file__), "deep_data")
os.makedirs(OUT_DIR, exist_ok=True)

END_DATE = datetime.date(2026, 8, 6)
MONTHS_BACK = 18
WINDOW_DAYS = 44  # API ceiling is 45 days per call


def strike_label(off):
    return "ATM" if off == 0 else f"ATM{'+' if off > 0 else ''}{off}"


def windows():
    start = END_DATE - datetime.timedelta(days=int(MONTHS_BACK * 30.4))
    out = []
    cur = start
    while cur < END_DATE:
        stop = min(cur + datetime.timedelta(days=WINDOW_DAYS), END_DATE)
        out.append((cur.isoformat(), stop.isoformat()))
        cur = stop + datetime.timedelta(days=1)
    return out


def fetch(security_id, exch, strike, opt_type, from_date, to_date, retries=3):
    body = {
        "exchangeSegment": exch,
        "interval": "5",
        "securityId": security_id,
        "instrument": "OPTIDX",
        "expiryFlag": "WEEK",
        "expiryCode": "1",
        "strike": strike,
        "drvOptionType": opt_type,
        "requiredData": ["open", "high", "low", "close", "oi", "spot",
                          "strike", "timestamp", "volume", "iv"],
        "fromDate": from_date,
        "toDate": to_date,
    }
    for attempt in range(retries):
        try:
            r = requests.post(
                URL,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                    "access-token": TOKEN,
                    "client-id": CLIENT_ID,
                },
                json=body,
                timeout=45,
            )
            if r.status_code == 200:
                return r.json()
            if r.status_code in (429, 503, 502):
                time.sleep(3 * (attempt + 1))
                continue
            print(f"  ! {security_id} {strike} {opt_type} {from_date}: HTTP {r.status_code} "
                  f"{r.text[:160]}", file=sys.stderr)
            return None
        except Exception as e:
            print(f"  ! network {e}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    return None


def main():
    wins = windows()
    total = len(UNDERLYINGS) * len(OFFSETS) * 2 * len(wins)
    print(f"{len(wins)} windows x {len(UNDERLYINGS)} indexes x {len(OFFSETS)} offsets x 2 sides "
          f"= {total} calls", flush=True)
    done = 0
    for u, (sid, exch) in UNDERLYINGS.items():
        for off in OFFSETS:
            label = strike_label(off)
            for opt in ["CALL", "PUT"]:
                for (fd, td) in wins:
                    out_path = os.path.join(OUT_DIR, f"{u}_{label}_{opt}_{fd}.json")
                    done += 1
                    if os.path.exists(out_path):
                        continue
                    data = fetch(sid, exch, label, opt, fd, td)
                    if data is not None:
                        with open(out_path, "w") as f:
                            json.dump(data, f)
                    if done % 50 == 0:
                        print(f"  ...{done}/{total}", flush=True)
                    time.sleep(1.05)
    print("done", flush=True)


if __name__ == "__main__":
    main()
