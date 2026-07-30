"""System routes — health, engine status, risk settings and the event log."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..config import INDEX_UNIVERSE, settings
from ..db import DB
from ..risk import market_status
from ..schemas import RiskEvent
from ..state import ENGINE
from ..stream_hub import HUB

router = APIRouter(prefix="/api", tags=["system"])


class RiskSettings(BaseModel):
    risk_pct: float | None = Field(None, gt=0, le=100)
    paper_capital: float | None = Field(None, gt=0)


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "delta-k-terminal",
        "master_ready": ENGINE.master.ready,
        "feed_connected": ENGINE.feed_connected,
        "clients": HUB.client_count,
        "database": DB.enabled,
    }


@router.get("/status")
async def status():
    return {
        **ENGINE.status(),
        **market_status(),
        "simulated": ENGINE.simulating,
        "stream_clients": HUB.client_count,
        "frames_published": HUB.frames_published,
        "universe": list(INDEX_UNIVERSE),
        "database": DB.status(),
        "config": {
            "invalidation_pct": settings.invalidation_pct,
            "daylight_rest": settings.daylight_rest.strftime("%H:%M"),
            "chain_depth": settings.chain_depth,
            "itm_depth": [settings.min_itm_depth, settings.max_itm_depth],
            "max_concurrent_positions": settings.max_concurrent_positions,
            "slippage_pct": settings.paper_slippage_pct,
        },
    }


@router.get("/events", response_model=list[RiskEvent])
async def events(limit: int = 50):
    return list(ENGINE.events)[: max(1, min(limit, 100))]


@router.post("/risk-settings")
async def risk_settings(payload: RiskSettings):
    if payload.risk_pct is not None:
        ENGINE.risk_pct = payload.risk_pct
    if payload.paper_capital is not None:
        if ENGINE.ledger.open_positions:
            raise HTTPException(
                status_code=409,
                detail="Close open positions before resetting paper capital.",
            )
        ENGINE.ledger.reset(payload.paper_capital)
    return {"risk_pct": ENGINE.risk_pct, "capital": ENGINE.capital()}


@router.post("/paper/reset")
async def reset_paper():
    ENGINE.ledger.reset()
    ENGINE.log_event("INFO", "Paper ledger reset to starting capital.")
    return ENGINE.ledger.snapshot(ENGINE.mode)
