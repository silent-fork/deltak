"""Dual-mode execution router.

Paper Mode fills against the live WebSocket LTP with modelled slippage and books
the position into the virtual ledger.  Live Mode routes the same intent to Angel
One's ``placeOrder`` endpoint and mirrors the resulting position locally so the
HUD, the risk loop and the panic-flatten path behave identically in both modes.
"""

from __future__ import annotations

import logging

from .config import settings
from .db import DB
from .ledger import apply_slippage
from .schemas import (
    ExecutionMode,
    OrderRequest,
    OrderResult,
    Position,
    Side,
)
from .smart_api import SmartApiError, smart_api
from .state import ENGINE

log = logging.getLogger("deltak.exec")


def _resolve_quantity(req: OrderRequest) -> tuple[int, int, int]:
    """Return ``(quantity, lots, lot_size)`` from whichever the caller supplied."""
    lot_size = req.lot_size or ENGINE.master.lot_size(req.underlying)
    lot_size = max(1, int(lot_size))
    if req.quantity:
        quantity = int(req.quantity)
        lots = max(1, quantity // lot_size)
    elif req.lots:
        lots = int(req.lots)
        quantity = lots * lot_size
    else:
        return 0, 0, lot_size
    return quantity, lots, lot_size


def _reference_price(req: OrderRequest, side: Side) -> float:
    if req.order_type == "LIMIT" and req.price > 0:
        return req.price
    ltp = ENGINE.ticks.ltp(req.token)
    if ltp <= 0:
        ltp = req.price
    return ltp


async def execute_order(req: OrderRequest) -> OrderResult:
    """Route one order to the paper ledger or to NSE via SmartAPI."""
    mode = req.mode or ENGINE.mode
    quantity, lots, lot_size = _resolve_quantity(req)

    if quantity <= 0:
        return OrderResult(
            ok=False,
            mode=mode,
            message="Order rejected: resolved quantity is zero.",
        )

    open_count = len(ENGINE.ledger.open_positions)
    if (
        req.transaction_type is Side.BUY
        and open_count >= settings.max_concurrent_positions
    ):
        return OrderResult(
            ok=False,
            mode=mode,
            message=(
                f"Order rejected: {open_count} open positions already at the "
                f"{settings.max_concurrent_positions}-position ceiling."
            ),
        )

    reference = _reference_price(req, req.transaction_type)
    if reference <= 0:
        return OrderResult(
            ok=False,
            mode=mode,
            message="Order rejected: no live price for this contract.",
        )

    if mode is ExecutionMode.LIVE:
        result = await _execute_live(req, quantity, lots, lot_size, reference)
    else:
        result = _execute_paper(req, quantity, lots, lot_size, reference)

    DB.record_order(req, result)
    if result.position_id:
        position = ENGINE.ledger.get(result.position_id)
        if position:
            DB.record_position(position)
    return result


def _book(
    req: OrderRequest,
    quantity: int,
    lots: int,
    lot_size: int,
    fill: float,
    mode: ExecutionMode,
) -> Position:
    return ENGINE.ledger.open_position(
        underlying=req.underlying,
        token=req.token,
        trading_symbol=req.trading_symbol,
        quantity=quantity,
        lots=lots,
        lot_size=lot_size,
        price=fill,
        side=req.transaction_type,
        option_type=req.option_type,
        strike=req.strike,
        stop_loss=req.stop_loss,
        target=req.target,
        protocol=req.protocol,
        mode=mode,
    )


def _execute_paper(
    req: OrderRequest, quantity: int, lots: int, lot_size: int, reference: float
) -> OrderResult:
    fill = apply_slippage(reference, req.transaction_type)
    pos = _book(req, quantity, lots, lot_size, fill, ExecutionMode.PAPER)
    ENGINE.log_event(
        "INFO",
        f"PAPER {req.transaction_type.value} {lots}×{lot_size} {req.trading_symbol} "
        f"@ {fill:.2f}",
        req.underlying,
    )
    return OrderResult(
        ok=True,
        mode=ExecutionMode.PAPER,
        order_id=pos.id,
        position_id=pos.id,
        message=f"Simulated fill {lots} lot(s) @ ₹{fill:,.2f} (slippage applied).",
        fill_price=fill,
        quantity=quantity,
    )


async def _execute_live(
    req: OrderRequest, quantity: int, lots: int, lot_size: int, reference: float
) -> OrderResult:
    if not smart_api.authenticated:
        return OrderResult(
            ok=False,
            mode=ExecutionMode.LIVE,
            message="Live mode requires an active SmartAPI session.",
        )
    try:
        data = await smart_api.place_order(
            trading_symbol=req.trading_symbol,
            symbol_token=req.token,
            transaction_type=req.transaction_type.value,
            quantity=quantity,
            order_type=req.order_type,
            price=req.price if req.order_type == "LIMIT" else 0.0,
        )
    except SmartApiError as exc:
        ENGINE.log_event(
            "INFO", f"LIVE order rejected: {exc}", req.underlying
        )
        return OrderResult(
            ok=False,
            mode=ExecutionMode.LIVE,
            message=f"SmartAPI rejected the order: {exc}",
            raw=exc.raw if isinstance(exc.raw, dict) else None,
        )

    order_id = str(data.get("orderid") or data.get("uniqueorderid") or "")
    pos = _book(req, quantity, lots, lot_size, reference, ExecutionMode.LIVE)
    ENGINE.log_event(
        "INFO",
        f"LIVE {req.transaction_type.value} {lots}×{lot_size} {req.trading_symbol} "
        f"— order {order_id}",
        req.underlying,
    )
    return OrderResult(
        ok=True,
        mode=ExecutionMode.LIVE,
        order_id=order_id,
        position_id=pos.id,
        message=f"Order {order_id} accepted by NSE for {quantity} qty.",
        fill_price=reference,
        quantity=quantity,
        raw=data,
    )


# --------------------------------------------------------------------------- #
# exits
# --------------------------------------------------------------------------- #
async def close_position(position_id: str, reason: str = "MANUAL") -> OrderResult:
    """Flatten a single position in whichever mode it was opened."""
    pos = ENGINE.ledger.get(position_id)
    if pos is None:
        return OrderResult(ok=False, mode=ENGINE.mode, message="Unknown position id.")

    exit_side = Side.SELL if pos.side is Side.BUY else Side.BUY
    ltp = ENGINE.ticks.ltp(pos.token, pos.ltp or pos.avg_price)

    if pos.mode is ExecutionMode.LIVE and smart_api.authenticated:
        try:
            await smart_api.place_order(
                trading_symbol=pos.trading_symbol,
                symbol_token=pos.token,
                transaction_type=exit_side.value,
                quantity=pos.quantity,
                order_type="MARKET",
            )
        except SmartApiError as exc:
            return OrderResult(
                ok=False,
                mode=ExecutionMode.LIVE,
                message=f"Exit order rejected: {exc}",
            )
        fill = ltp
    else:
        fill = apply_slippage(ltp, exit_side)

    closed = ENGINE.ledger.close_position(position_id, fill, reason=reason)
    if closed is None:
        return OrderResult(ok=False, mode=pos.mode, message="Position already closed.")

    DB.record_position(closed)
    ENGINE.log_event(
        "INFO",
        f"EXIT [{reason}] {closed.trading_symbol} @ {fill:.2f} → "
        f"PnL ₹{closed.realised_pnl:,.2f}",
        closed.underlying,
    )
    return OrderResult(
        ok=True,
        mode=closed.mode,
        order_id=closed.id,
        position_id=closed.id,
        message=f"Closed {closed.trading_symbol} @ ₹{fill:,.2f} · PnL ₹{closed.realised_pnl:,.2f}",
        fill_price=fill,
        quantity=closed.quantity,
    )


async def panic_flatten(reason: str = "PANIC") -> list[OrderResult]:
    """Emergency: close every open position, paper and live alike."""
    results: list[OrderResult] = []
    for pos in list(ENGINE.ledger.open_positions):
        results.append(await close_position(pos.id, reason=reason))
    if results:
        ENGINE.log_event(
            "PANIC" if reason == "PANIC" else "INFO",
            f"Flatten [{reason}] executed across {len(results)} position(s).",
        )
    return results


async def scale_out(position_id: str, fraction: float = 0.5) -> OrderResult:
    """TP1 partial exit — used when a node rotates into the Weakening quadrant."""
    pos = ENGINE.ledger.get(position_id)
    if pos is None:
        return OrderResult(ok=False, mode=ENGINE.mode, message="Unknown position id.")
    lots = max(1, int(pos.lots * fraction))
    if lots >= pos.lots:
        return await close_position(position_id, reason="TP1")

    ltp = ENGINE.ticks.ltp(pos.token, pos.ltp or pos.avg_price)
    if pos.mode is ExecutionMode.LIVE and smart_api.authenticated:
        try:
            await smart_api.place_order(
                trading_symbol=pos.trading_symbol,
                symbol_token=pos.token,
                transaction_type=(Side.SELL if pos.side is Side.BUY else Side.BUY).value,
                quantity=lots * pos.lot_size,
                order_type="MARKET",
            )
        except SmartApiError as exc:
            return OrderResult(
                ok=False, mode=ExecutionMode.LIVE, message=f"Scale-out rejected: {exc}"
            )
        fill = ltp
    else:
        fill = apply_slippage(ltp, Side.SELL if pos.side is Side.BUY else Side.BUY)

    residual = ENGINE.ledger.reduce_position(position_id, lots, fill, reason="TP1")
    if residual:
        DB.record_position(residual)
    ENGINE.log_event(
        "TARGET",
        f"TP1 scale-out {lots} lot(s) of {pos.trading_symbol} @ {fill:.2f}",
        pos.underlying,
    )
    return OrderResult(
        ok=True,
        mode=pos.mode,
        position_id=position_id,
        message=f"Scaled out {lots} lot(s) @ ₹{fill:,.2f}",
        fill_price=fill,
        quantity=lots * pos.lot_size,
    )
