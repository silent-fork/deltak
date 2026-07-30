"""Dynamic position sizing.

    lots = floor( (capital × risk% ) / (stop_loss_points × lot_size) )

The raw risk-derived lot count is then clamped by two hard realities: you cannot
buy more premium than the account holds, and the exchange only trades whole
lots.  NSE index lot increments (NIFTY 25/50/75, BANKNIFTY 15, FINNIFTY 25/40)
are respected via the scrip master's lot size, with the configured increments as
the fallback ladder.
"""

from __future__ import annotations

import math

from ..config import INDEX_UNIVERSE, settings
from ..schemas import SizingResult


def round_to_lot(quantity: int, lot_size: int) -> int:
    """Floor an arbitrary quantity onto the nearest tradable lot multiple."""
    if lot_size <= 0:
        return max(0, quantity)
    return (quantity // lot_size) * lot_size


def resolve_lot_size(underlying: str, override: int | None = None) -> int:
    if override and override > 0:
        return int(override)
    return int(INDEX_UNIVERSE.get(underlying, {}).get("lot_size", 1))


def calculate_size(
    underlying: str,
    stop_loss_points: float,
    capital: float | None = None,
    risk_pct: float | None = None,
    lot_size: int | None = None,
    entry_price: float | None = None,
    max_deployable: float | None = None,
) -> SizingResult:
    """Compute the risk-adjusted lot count for one Delta-K entry.

    Args:
        stop_loss_points: Premium points between entry and stop.
        capital: Account capital; defaults to the paper capital setting.
        risk_pct: Percent of capital risked on this trade.
        lot_size: Contract multiplier; defaults to the index lot size.
        entry_price: Option premium, used for the entry-cost/affordability cap.
        max_deployable: Optional ceiling on deployable capital (free margin).
    """
    capital = float(capital if capital is not None else settings.paper_capital)
    risk_pct = float(risk_pct if risk_pct is not None else settings.risk_pct_per_trade)
    lot = resolve_lot_size(underlying, lot_size)

    risk_amount = capital * (risk_pct / 100.0)
    risk_per_lot = max(0.0, stop_loss_points) * lot

    capped_by: str | None = None
    if risk_per_lot <= 0:
        lots = 0
        capped_by = "INVALID_STOP"
    else:
        lots = int(math.floor(risk_amount / risk_per_lot))

    entry_cost = 0.0
    if entry_price and entry_price > 0 and lots > 0:
        budget = capital if max_deployable is None else min(capital, max_deployable)
        cost_per_lot = entry_price * lot
        affordable = int(math.floor(budget / cost_per_lot)) if cost_per_lot > 0 else 0
        if affordable < lots:
            lots = affordable
            capped_by = "CAPITAL"
        entry_cost = lots * cost_per_lot

    lots = max(0, lots)
    if lots == 0 and capped_by is None:
        capped_by = "RISK_BUDGET"

    return SizingResult(
        lots=lots,
        quantity=lots * lot,
        lot_size=lot,
        risk_amount=round(risk_amount, 2),
        risk_per_lot=round(risk_per_lot, 2),
        entry_cost=round(entry_cost, 2),
        capital=round(capital, 2),
        risk_pct=risk_pct,
        capped_by=capped_by,
    )
