"""Market-data routes: option chain, RRG nodes, signals and the live stream."""

from __future__ import annotations

import asyncio
import contextlib

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse

from ..config import INDEX_UNIVERSE
from ..engine.sizing import calculate_size
from ..schemas import (
    EngineSnapshot,
    OptionChain,
    RrgNode,
    Signal,
    SizingRequest,
    SizingResult,
)
from ..state import ENGINE
from ..stream_hub import HUB

router = APIRouter(prefix="/api", tags=["market"])

SSE_KEEPALIVE = 15.0


def _validate(underlying: str) -> str:
    underlying = underlying.upper()
    if underlying not in INDEX_UNIVERSE:
        raise HTTPException(status_code=404, detail=f"Unknown index {underlying}")
    return underlying


@router.get("/snapshot", response_model=EngineSnapshot)
async def snapshot() -> EngineSnapshot:
    """One-shot engine snapshot — the same payload the stream pushes."""
    await ENGINE.refresh(advance_rrg=False)
    return ENGINE.snapshot()


@router.get("/chain/{underlying}", response_model=OptionChain)
async def chain(underlying: str) -> OptionChain:
    underlying = _validate(underlying)
    if underlying not in ENGINE.chains:
        await ENGINE.refresh(advance_rrg=False)
    return ENGINE.chains[underlying]


@router.get("/rrg/{underlying}", response_model=list[RrgNode])
async def rrg(underlying: str) -> list[RrgNode]:
    underlying = _validate(underlying)
    return ENGINE.rrg_nodes(underlying)


@router.get("/signal/{underlying}", response_model=Signal)
async def signal(underlying: str) -> Signal:
    underlying = _validate(underlying)
    if underlying not in ENGINE.signals:
        await ENGINE.refresh(advance_rrg=False)
    sig = ENGINE.signals.get(underlying)
    if sig is None:
        raise HTTPException(status_code=503, detail="Signal engine warming up")
    return sig


@router.post("/calculate-size", response_model=SizingResult)
async def calculate_size_route(payload: SizingRequest) -> SizingResult:
    """Risk-adjusted lot sizing: floor(capital × risk% / (stop points × lot size))."""
    underlying = _validate(payload.underlying)
    if payload.stop_loss_points <= 0:
        raise HTTPException(status_code=400, detail="stop_loss_points must be > 0")
    return calculate_size(
        underlying,
        stop_loss_points=payload.stop_loss_points,
        capital=payload.capital if payload.capital is not None else ENGINE.capital(),
        risk_pct=payload.risk_pct if payload.risk_pct is not None else ENGINE.risk_pct,
        lot_size=payload.lot_size or ENGINE.master.lot_size(underlying),
        entry_price=payload.entry_price,
    )


# --------------------------------------------------------------------------- #
# live transports
# --------------------------------------------------------------------------- #
@router.get("/stream")
async def stream() -> StreamingResponse:
    """Server-Sent Events feed of engine snapshots."""

    async def event_source():
        queue = HUB.subscribe()
        try:
            yield ": delta-k stream open\n\n"
            while True:
                try:
                    payload = await asyncio.wait_for(queue.get(), timeout=SSE_KEEPALIVE)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                yield f"event: snapshot\ndata: {payload}\n\n"
        except asyncio.CancelledError:
            raise
        finally:
            HUB.unsubscribe(queue)

    return StreamingResponse(
        event_source(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.websocket("/ws")
async def websocket_stream(ws: WebSocket) -> None:
    """WebSocket transport carrying the identical snapshot payload."""
    await ws.accept()
    queue = HUB.subscribe()
    try:
        while True:
            payload = await queue.get()
            await ws.send_text(payload)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    except Exception:  # noqa: BLE001
        pass
    finally:
        HUB.unsubscribe(queue)
        with contextlib.suppress(Exception):
            await ws.close()
