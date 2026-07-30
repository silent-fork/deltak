"""Execution routes — order placement, exits, panic flatten and the ledger."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..execution import close_position, execute_order, panic_flatten, scale_out
from ..schemas import (
    ExecutionMode,
    LedgerSnapshot,
    OrderRequest,
    OrderResult,
    Protocol,
    Side,
)
from ..state import ENGINE

router = APIRouter(prefix="/api", tags=["orders"])


class ModeRequest(BaseModel):
    mode: ExecutionMode


class ExitRequest(BaseModel):
    position_id: str
    reason: str = "MANUAL"


class ScaleOutRequest(BaseModel):
    position_id: str
    fraction: float = 0.5


class SignalExecuteRequest(BaseModel):
    """Execute the currently published signal for an underlying, as-is."""

    underlying: str
    lots: int | None = None
    mode: ExecutionMode | None = None
    #: Set true to place the order even when the engine has blocked the signal.
    override: bool = False


@router.post("/order/execute", response_model=OrderResult)
async def execute(payload: OrderRequest) -> OrderResult:
    return await execute_order(payload)


@router.post("/order/from-signal", response_model=OrderResult)
async def execute_from_signal(payload: SignalExecuteRequest) -> OrderResult:
    """One-click execution of the live Delta-K signal."""
    underlying = payload.underlying.upper()
    sig = ENGINE.signals.get(underlying)
    if sig is None:
        raise HTTPException(status_code=404, detail="No signal for this index yet.")
    if not sig.token or not sig.trading_symbol or not sig.sizing:
        raise HTTPException(status_code=409, detail="Signal has no executable node.")
    if not sig.actionable and not payload.override:
        raise HTTPException(
            status_code=409,
            detail=f"Signal is blocked ({sig.blocked_reason}). Pass override to force.",
        )

    lots = payload.lots or sig.sizing.lots
    if lots <= 0:
        raise HTTPException(status_code=409, detail="Sizing resolved to zero lots.")

    return await execute_order(
        OrderRequest(
            underlying=underlying,
            token=sig.token,
            trading_symbol=sig.trading_symbol,
            transaction_type=Side.BUY,
            lots=lots,
            lot_size=sig.sizing.lot_size,
            order_type="MARKET",
            stop_loss=sig.stop_loss,
            target=sig.target_1,
            protocol=sig.protocol or Protocol.DELTA,
            option_type=sig.option_type,
            strike=sig.strike,
            mode=payload.mode,
        )
    )


@router.post("/order/exit", response_model=OrderResult)
async def exit_position(payload: ExitRequest) -> OrderResult:
    result = await close_position(payload.position_id, reason=payload.reason)
    if not result.ok:
        raise HTTPException(status_code=409, detail=result.message)
    return result


@router.post("/order/scale-out", response_model=OrderResult)
async def scale_out_position(payload: ScaleOutRequest) -> OrderResult:
    result = await scale_out(payload.position_id, fraction=payload.fraction)
    if not result.ok:
        raise HTTPException(status_code=409, detail=result.message)
    return result


@router.post("/order/panic-exit", response_model=list[OrderResult])
async def panic_exit() -> list[OrderResult]:
    """PANIC FLATTEN — closes every open position in both paper and live modes."""
    return await panic_flatten(reason="PANIC")


@router.get("/portfolio", response_model=LedgerSnapshot)
async def portfolio() -> LedgerSnapshot:
    ENGINE.ledger.mark_to_market(ENGINE.ticks)
    return ENGINE.ledger.snapshot(ENGINE.mode)


@router.post("/mode")
async def set_mode(payload: ModeRequest):
    """Switch the execution engine between Paper and Live."""
    if payload.mode is ExecutionMode.LIVE and not ENGINE.ticks.updates:
        raise HTTPException(
            status_code=409, detail="Refusing Live mode without a live market feed."
        )
    if payload.mode is ExecutionMode.LIVE:
        from ..smart_api import smart_api

        if not smart_api.authenticated:
            raise HTTPException(
                status_code=409, detail="Live mode requires a SmartAPI session."
            )
    ENGINE.mode = payload.mode
    ENGINE.log_event("INFO", f"Execution mode switched to {payload.mode.value.upper()}.")
    return {"mode": ENGINE.mode.value}
