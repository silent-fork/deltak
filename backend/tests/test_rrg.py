from __future__ import annotations

from app.engine.rrg import MIN_SAMPLES, RrgEngine, classify_quadrant
from app.schemas import Quadrant


def test_quadrant_matrix():
    assert classify_quadrant(101, 101) is Quadrant.LEADING
    assert classify_quadrant(99, 101) is Quadrant.IMPROVING
    assert classify_quadrant(101, 99) is Quadrant.WEAKENING
    assert classify_quadrant(99, 99) is Quadrant.LAGGING
    # Boundaries resolve to the strong side.
    assert classify_quadrant(100, 100) is Quadrant.LEADING


def test_flat_series_sits_at_the_origin():
    engine = RrgEngine(window=20, momentum_lookback=3)
    for _ in range(30):
        point = engine.update("T1", price=100.0, benchmark=20_000.0)
    assert point.rs_ratio == 100.0
    assert point.rs_momentum == 100.0


def test_outperformance_rotates_into_leading():
    engine = RrgEngine(window=20, momentum_lookback=3)
    price = 100.0
    for _ in range(40):
        price *= 1.01  # option strengthens against a flat index
        point = engine.update("T1", price=price, benchmark=20_000.0)
    assert point.rs_ratio > 100.0
    assert point.rs_momentum > 100.0
    assert engine.quadrant("T1") is Quadrant.LEADING


def test_decay_rotates_into_lagging():
    engine = RrgEngine(window=20, momentum_lookback=3)
    price = 100.0
    for _ in range(40):
        price *= 0.99
        point = engine.update("T1", price=price, benchmark=20_000.0)
    assert point.rs_ratio < 100.0
    assert engine.quadrant("T1") is Quadrant.LAGGING


def test_nodes_are_damped_until_matured():
    engine = RrgEngine(window=20, momentum_lookback=2)
    price = 100.0
    for i in range(1, MIN_SAMPLES):
        price *= 1.05
        engine.update("T1", price=price, benchmark=20_000.0)
        assert not engine.matured("T1")
    engine.update("T1", price=price * 1.05, benchmark=20_000.0)
    assert engine.matured("T1")


def test_tail_is_bounded_and_reset_clears_state():
    engine = RrgEngine(window=10, momentum_lookback=2, tail_length=5)
    for i in range(20):
        engine.update("T1", price=100.0 + i, benchmark=20_000.0)
    assert len(engine.tail("T1")) == 5
    engine.reset("T1")
    assert engine.point("T1") is None


def test_zero_inputs_never_raise():
    engine = RrgEngine()
    point = engine.update("T1", price=0.0, benchmark=0.0)
    assert point.rs_ratio == 100.0
