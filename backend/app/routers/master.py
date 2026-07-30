"""Scrip-master routes — the unauthenticated cold bootstrapper surface."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..config import INDEX_UNIVERSE
from ..scrip_master import load_master, parse_expiry
from ..state import ENGINE

router = APIRouter(prefix="/api/master", tags=["master"])


@router.get("/init")
async def init(force: bool = Query(False, description="Bypass the on-disk cache")):
    """Ingest and cache ``OpenAPIScripMaster.json`` (no authentication required)."""
    try:
        master = await load_master(force=force)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(
            status_code=502, detail=f"Scrip master download failed: {exc}"
        ) from exc
    ENGINE.attach_master(master)
    ENGINE.track_universe()
    await ENGINE.resync_universe()
    return master.summary()


@router.get("/summary")
async def summary():
    return ENGINE.master.summary()


@router.get("/expiries/{underlying}")
async def expiries(underlying: str):
    underlying = underlying.upper()
    if underlying not in INDEX_UNIVERSE:
        raise HTTPException(status_code=404, detail=f"Unknown index {underlying}")
    return {
        "underlying": underlying,
        "expiries": [e.isoformat() for e in ENGINE.master.expiries(underlying)],
        "nearest": (
            ENGINE.master.nearest_expiry(underlying).isoformat()
            if ENGINE.master.nearest_expiry(underlying)
            else None
        ),
    }


@router.get("/contracts/{underlying}")
async def contracts(
    underlying: str,
    expiry: str | None = Query(None, description="ISO or DDMMMYYYY expiry"),
    limit: int = Query(500, ge=1, le=5000),
):
    underlying = underlying.upper()
    if underlying not in INDEX_UNIVERSE:
        raise HTTPException(status_code=404, detail=f"Unknown index {underlying}")

    parsed = None
    if expiry:
        try:
            from datetime import date

            parsed = date.fromisoformat(expiry)
        except ValueError:
            parsed = parse_expiry(expiry)
        if parsed is None:
            raise HTTPException(status_code=400, detail="Unparseable expiry")

    rows = ENGINE.master.contracts(underlying, parsed)
    return {
        "underlying": underlying,
        "expiry": (parsed or ENGINE.master.nearest_expiry(underlying)),
        "count": len(rows),
        "contracts": [c.as_dict() for c in rows[:limit]],
    }
