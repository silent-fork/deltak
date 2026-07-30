from __future__ import annotations

import struct

import pytest

from app.ledger import Ledger, apply_slippage
from app.risk import breach
from app.schemas import ExecutionMode, OptionType, Side, Tick
from app.state import seconds_to_daylight_rest
from app.ws_manager import TickStore, decode_packet


# --------------------------------------------------------------------------- #
# ledger
# --------------------------------------------------------------------------- #
def _open(ledger: Ledger, price: float = 100.0, lots: int = 2) -> str:
    pos = ledger.open_position(
        underlying="NIFTY",
        token="1001",
        trading_symbol="NIFTY24500CE",
        quantity=lots * 75,
        lots=lots,
        lot_size=75,
        price=price,
        option_type=OptionType.CE,
        strike=24_500.0,
        stop_loss=75.0,
        target=150.0,
        mode=ExecutionMode.PAPER,
    )
    return pos.id


def test_slippage_moves_against_the_taker():
    assert apply_slippage(100.0, Side.BUY, 0.01) == 101.0
    assert apply_slippage(100.0, Side.SELL, 0.01) == 99.0


def test_unrealised_pnl_marks_to_the_live_feed():
    ledger = Ledger(capital=500_000)
    _open(ledger)
    ticks = TickStore()
    ticks.apply(Tick(token="1001", ltp=120.0))
    ledger.mark_to_market(ticks)
    pos = ledger.open_positions[0]
    assert pos.unrealised_pnl == pytest.approx(20.0 * 150)
    assert pos.pnl_pct == pytest.approx(20.0)


def test_close_books_realised_pnl_and_charges():
    ledger = Ledger(capital=500_000)
    pid = _open(ledger)
    opening_charges = ledger.charges
    closed = ledger.close_position(pid, price=130.0, reason="TARGET")
    assert closed.realised_pnl == pytest.approx(30.0 * 150)
    assert closed.status == "CLOSED"
    assert ledger.charges > opening_charges
    assert ledger.open_positions == []
    assert ledger.realised == pytest.approx(4_500.0)


def test_scale_out_keeps_the_residual_position():
    ledger = Ledger(capital=500_000)
    pid = _open(ledger, lots=4)
    ledger.reduce_position(pid, lots=2, price=120.0)
    pos = ledger.get(pid)
    assert pos.lots == 2
    assert pos.quantity == 150
    assert ledger.realised == pytest.approx(20.0 * 150)


def test_scale_out_of_everything_closes_the_position():
    ledger = Ledger(capital=500_000)
    pid = _open(ledger, lots=2)
    ledger.reduce_position(pid, lots=2, price=120.0)
    assert ledger.get(pid) is None


def test_snapshot_totals():
    ledger = Ledger(capital=500_000)
    _open(ledger)
    ticks = TickStore()
    ticks.apply(Tick(token="1001", ltp=110.0))
    ledger.mark_to_market(ticks)
    snap = ledger.snapshot(ExecutionMode.PAPER)
    assert snap.open_pnl == pytest.approx(1_500.0)
    assert snap.total_pnl == pytest.approx(1_500.0)
    assert snap.deployed_margin == pytest.approx(15_000.0)


# --------------------------------------------------------------------------- #
# circuit breakers
# --------------------------------------------------------------------------- #
def test_035_percent_invalidation_band():
    # 0.35% of 24300 is ~85 points.
    assert breach(24_300 - 100, 24_300.0, "below") is True
    assert breach(24_300 - 50, 24_300.0, "below") is False
    assert breach(24_800 + 100, 24_800.0, "above") is True
    assert breach(24_800 + 50, 24_800.0, "above") is False
    assert breach(24_500, None, "below") is False


def test_daylight_rest_countdown_is_monotonic():
    from datetime import datetime

    from app.config import IST

    before = datetime(2026, 7, 30, 15, 0, tzinfo=IST)
    after = datetime(2026, 7, 30, 15, 20, tzinfo=IST)
    assert seconds_to_daylight_rest(before) == 15 * 60
    assert seconds_to_daylight_rest(after) == 0


# --------------------------------------------------------------------------- #
# SmartStream binary decoding
# --------------------------------------------------------------------------- #
def _snap_quote(token: str = "35005", ltp: float = 187.25, oi: int = 512_000) -> bytes:
    buf = bytearray(379)
    buf[0] = 3  # snap quote
    buf[1] = 2  # NSE F&O
    buf[2 : 2 + len(token)] = token.encode()
    struct.pack_into("<q", buf, 27, 1)
    struct.pack_into("<q", buf, 35, 1_700_000_000_000)
    struct.pack_into("<q", buf, 43, int(ltp * 100))
    struct.pack_into("<q", buf, 67, 1_250_000)  # volume
    struct.pack_into("<q", buf, 91, 18_000)  # open
    struct.pack_into("<q", buf, 99, 20_000)  # high
    struct.pack_into("<q", buf, 107, 17_000)  # low
    struct.pack_into("<q", buf, 115, 18_500)  # close
    struct.pack_into("<q", buf, 131, oi)
    struct.pack_into("<d", buf, 139, 4.5)
    # one buy and one sell depth packet
    struct.pack_into("<h", buf, 147, 1)
    struct.pack_into("<q", buf, 157, int(187.10 * 100))
    struct.pack_into("<h", buf, 167, 0)
    struct.pack_into("<q", buf, 177, int(187.40 * 100))
    return bytes(buf)


def test_decode_snap_quote_packet():
    tick = decode_packet(_snap_quote())
    assert tick.token == "35005"
    assert tick.ltp == pytest.approx(187.25)
    assert tick.volume == 1_250_000
    assert tick.oi == 512_000
    assert tick.close == pytest.approx(185.0)
    assert tick.best_bid == pytest.approx(187.10)
    assert tick.best_ask == pytest.approx(187.40)


def test_decode_rejects_truncated_frames():
    assert decode_packet(b"\x03\x02") is None


def test_tick_store_tracks_intraday_oi_change():
    store = TickStore()
    store.apply(Tick(token="35005", ltp=100.0, oi=400_000))
    store.apply(Tick(token="35005", ltp=101.0, oi=460_000))
    assert store.oi_change("35005") == 60_000
    assert store.prev_ltp("35005") == pytest.approx(100.0)


def test_tick_store_carries_forward_missing_fields():
    store = TickStore()
    store.apply(Tick(token="35005", ltp=100.0, oi=400_000, volume=999, close=95.0))
    store.apply(Tick(token="35005", ltp=101.0))
    tick = store.get("35005")
    assert tick.oi == 400_000 and tick.volume == 999 and tick.close == 95.0
