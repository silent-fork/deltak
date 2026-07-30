from __future__ import annotations

from app.engine.sizing import calculate_size, resolve_lot_size, round_to_lot


def test_formula_matches_specification():
    # floor(500000 * 1% / (10 * 75)) = floor(5000 / 750) = 6
    result = calculate_size(
        "NIFTY", stop_loss_points=10.0, capital=500_000, risk_pct=1.0, lot_size=75
    )
    assert result.lots == 6
    assert result.quantity == 6 * 75
    assert result.risk_amount == 5_000.0
    assert result.risk_per_lot == 750.0


def test_banknifty_lot_increment():
    result = calculate_size(
        "BANKNIFTY", stop_loss_points=30.0, capital=1_000_000, risk_pct=1.0
    )
    assert result.lot_size == 15
    assert result.quantity % 15 == 0


def test_capital_cap_applies_when_premium_is_expensive():
    result = calculate_size(
        "NIFTY",
        stop_loss_points=1.0,  # tiny stop -> huge risk-derived size
        capital=100_000,
        risk_pct=1.0,
        lot_size=75,
        entry_price=400.0,
    )
    assert result.capped_by == "CAPITAL"
    assert result.entry_cost <= 100_000
    assert result.lots == 3  # floor(100000 / (400 * 75))


def test_zero_lots_when_risk_budget_too_small():
    result = calculate_size(
        "NIFTY", stop_loss_points=500.0, capital=10_000, risk_pct=1.0, lot_size=75
    )
    assert result.lots == 0
    assert result.capped_by == "RISK_BUDGET"


def test_invalid_stop_is_rejected():
    assert calculate_size("NIFTY", stop_loss_points=0.0).capped_by == "INVALID_STOP"


def test_max_deployable_ceiling_is_respected():
    result = calculate_size(
        "NIFTY",
        stop_loss_points=1.0,
        capital=1_000_000,
        risk_pct=1.0,
        lot_size=75,
        entry_price=200.0,
        max_deployable=45_000,
    )
    assert result.lots == 3  # floor(45000 / 15000)


def test_round_to_lot_and_resolve():
    assert round_to_lot(163, 75) == 150
    assert round_to_lot(10, 0) == 10
    assert resolve_lot_size("FINNIFTY") == 40
    assert resolve_lot_size("FINNIFTY", override=25) == 25
