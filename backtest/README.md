# DKMS backtest pipeline

The scripts that produced every number in the [DKMS Backtesting & Performance
Report](../web/app/learn/backtest/page.tsx) (published at `/learn/backtest`)
and the backtest-related answers in the [FAQ](../web/lib/content/faq.ts).
Kept here — outside `web/`, since none of it runs in the Next.js app — so the
study is reproducible rather than a one-off result quoted from memory.

Pure standard library plus `requests` (`pip install -r requirements.txt`),
Python 3.9+. No numpy/pandas.

## Pipeline

```
fetch_deep.py  →  deep_data/*.json  →  framework.py  →  optimize.py  →  index_cache.pkl
                                                                              │
                              ┌───────────────────────────────────────────────┤
                              │                                               │
                      backtest_pnl_v2.py                              (R-space evaluation
                              │                                        stays inside optimize.py)
              ┌───────────────┼───────────────┐
              │               │               │
        final_stats.py  sharpe_report.py  rr_ratio.py
```

1. **`fetch_deep.py`** — pulls 18 months of 5-minute OHLC+OI+IV history from
   Dhan's rolling-option endpoint for all five indexes (NIFTY, BANKNIFTY,
   FINNIFTY, SENSEX, BANKEX), strikes ATM−5..ATM+5, both sides. Needs
   `DHAN_ToKEN` and `DHAN_CLIENT_ID` in the environment (a Dhan session — the
   same kind the terminal itself uses). Resumable: writes one JSON file per
   `(index, strike, side, date-window)` into `deep_data/`, skips files that
   already exist. This directory is gitignored — ~240MB of raw pulls,
   regenerate it rather than expect it committed.

2. **`framework.py`** — the signal and backtest engine: COA wall
   reconstruction (Aegis/Zenith), the RRG-style rotation read, the
   ALPHA/BETA/GAMMA protocol classifier, the Zero-OTM entry gate, the
   limit-entry (discount + timeout) and thesis-exit execution mechanics, and
   the bar-by-bar backtest loop itself (stops/targets checked against each
   bar's high/low, not its close). `DEFAULT_CFG` here is the signal
   configuration every other script imports unchanged — nothing downstream
   re-tunes the signal, only execution and sizing vary.

3. **`optimize.py`** — the walk-forward harness: `build_all()` loads
   `deep_data/` into `index_cache.pkl` (built once, reused after — pass
   `force=True` to rebuild from raw data), `make_splits()` divides trading
   days chronologically 60/20/20 into train/validate/test, and `run_cfg()`
   runs one config through all three folds in R-space (risk-multiples, not
   rupees — the unit `framework.py`'s stop/target math is defined in).

4. **`backtest_pnl_v2.py`** — the same signal, run through real position
   sizing (rupees, not R-multiples): shared paper wallet, per-trade risk
   budget, per-index lot sizes and margin, statutory charges (STT, exchange
   fees, stamp duty, GST) on both legs of every trade.

5. **`final_stats.py`** — the master report: R-space results by fold, by
   index, by protocol, by exit reason, and a bid-ask spread sensitivity sweep
   (0–3%); Rs P&L with the same breakdowns plus month-end equity. This is the
   direct source for the report's attribution tables.

6. **`sharpe_report.py`** — annualized Sharpe ratio and max drawdown off the
   full daily equity curve (every trading day gets a mark, not just days a
   trade closed), computed for three configurations in sequence — the
   originally-shipped 15%-risk/live-offer/stop-only config, the same 15%
   sizing with limit-entry + thesis-exit turned on, and the current 6%-risk
   shipped config — which is what the report's "how we got to 6%" section
   quotes directly.

7. **`rr_ratio.py`** — realized reward:risk (avg win ÷ avg loss) in both
   R-space and rupees, plus the breakeven win rate implied by that ratio.

8. **`credit_spread.py`** — a documented dead end, kept rather than deleted:
   tests the seller-side analogue of the same wall read (the app's own
   stated philosophy is an option *seller's*, not a buyer's — high OI marks
   where writers defend a strike). It comes back with no robust edge and
   worse behavior on some indexes, which is why the shipped strategy buys
   options against the wall rather than sells them. Referenced directly in
   the FAQ's backtest-validation answer.

9. **`discount_sweep.py`** — sweeps `limit_discount_pct` (shipped at 3.0%)
   from 3% to 10% to test whether a deeper limit-entry discount reduces
   drawdown. Two views: a full-period Rs P&L/Sharpe/max-DD sweep (real-money
   color, but *not* fold-restricted — picking a value by eyeballing this
   alone would be exactly the in-sample selection the rest of this pipeline
   exists to avoid), and an R-space walk-forward view that selects a
   discount from TRAIN+VALIDATE expectancy only and reports TEST once,
   unlooked-at until after the choice is made — the same discipline
   `optimize.py` applies everywhere else. Also reports each config's average
   lots-per-trade and average entry premium, because a deeper discount fills
   at a lower premium, which means a smaller absolute stop distance, which
   means fixed-fractional risk sizing puts *more* lots on each fill — part
   of any net-P&L change across the sweep is that sizing effect, not purely
   "better" trades, and the script surfaces it rather than leaving it
   implicit. See the report's position-sizing section for why this exact
   confound (smaller stop → bigger size) is already something this codebase
   watches for.

10. **`drawdown_robustness.py`** — the follow-up `discount_sweep.py` itself
    calls for: that first pass found expectancy climbing all the way to 10%,
    the top of the tested range, and flagged that the trend hadn't actually
    plateaued. This extends the sweep to 20% and answers the three questions
    that raises — does it plateau (no, not by 20% either, and the sample
    thins out too fast to trust anything past ~14-16%), where does the edge
    actually come from (fill rate: `framework.simulate_index` now accepts an
    optional `stats` dict and counts placed/filled/expired orders directly —
    59.8% of signals fill at 3%, 6.7% at 20%, so a deeper discount doesn't
    make trades better so much as it makes the strategy *pickier*), is it
    concentrated in one or two indexes (checked per-index at the naive
    winner vs a sample-size-aware pick), and does the edge survive the same
    adverse-spread stress every other config in this pipeline is checked
    against (yes, at every discount level tested). The naive walk-forward
    rule (max TRAIN+VALIDATE expectancy, no sample-size floor) always walks
    to the edge of whatever range you give it — the script computes that
    number and then a second, sample-size-floored version side by side, on
    purpose, since the first one alone is a trap.

## Running it

```bash
pip install -r requirements.txt
export DHAN_ToKEN=...        # a live Dhan session token
export DHAN_CLIENT_ID=...

python fetch_deep.py         # ~240MB into deep_data/, resumable, takes a while
python final_stats.py        # full stats sheet — R-space + Rs P&L + attribution
python sharpe_report.py      # sizing-evolution comparison (15% → 6%)
python rr_ratio.py           # realized risk:reward
python credit_spread.py      # the seller-side dead end
python discount_sweep.py     # limit-entry discount sweep, 3-10%
python drawdown_robustness.py  # extended to 20%, fill-rate + concentration + spread stress
```

`optimize.py` builds `index_cache.pkl` from `deep_data/` on first run (a few
minutes) and every later script reuses the cache. Both `deep_data/` and
`index_cache.pkl` are gitignored — regenerate them locally; they're too large
to commit and depend on a live Dhan session to pull.

## What's *not* here

Everything above is the exact chain that produced the shipped numbers. A
number of exploratory scripts that didn't pan out — a Bollinger-band signal
family, a wall-hysteresis audit, a couple of superseded optimizer/backtest
drafts — aren't included; the point of this directory is a clean,
reproducible path to the reported results, not a full session transcript.
