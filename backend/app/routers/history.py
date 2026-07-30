"""Historical reads backed by Supabase.

The browser never talks to Supabase directly: the service-role key stays on the
server and RLS denies anon access, so history is served through these endpoints.
Every route returns an empty list when persistence is disabled rather than
erroring, so the HUD degrades cleanly to in-memory-only operation.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from ..db import DB

router = APIRouter(prefix="/api/history", tags=["history"])


def _guard() -> None:
    if not DB.enabled:
        raise HTTPException(
            status_code=503,
            detail="Persistence is disabled — set DK_SUPABASE_URL and DK_SUPABASE_SERVICE_KEY.",
        )


async def _read(table: str, params: dict[str, str]) -> list[dict]:
    try:
        return await DB.query(table, params)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Supabase read failed: {exc}") from exc


@router.get("/sessions")
async def sessions(limit: int = Query(20, ge=1, le=100)):
    _guard()
    return await _read(
        "trading_sessions",
        {"select": "*", "order": "started_at.desc", "limit": str(limit)},
    )


@router.get("/positions")
async def positions(
    limit: int = Query(100, ge=1, le=500),
    underlying: str | None = None,
    status: str | None = Query(None, pattern="^(OPEN|CLOSED)$"),
    this_session: bool = Query(False, description="Restrict to the current session"),
):
    _guard()
    params = {
        "select": "*",
        "order": "opened_at.desc",
        "limit": str(limit),
    }
    if underlying:
        params["underlying"] = f"eq.{underlying.upper()}"
    if status:
        params["status"] = f"eq.{status}"
    if this_session and DB.session_id:
        params["session_id"] = f"eq.{DB.session_id}"
    return await _read("positions", params)


@router.get("/orders")
async def orders(
    limit: int = Query(100, ge=1, le=500),
    underlying: str | None = None,
):
    _guard()
    params = {"select": "*", "order": "created_at.desc", "limit": str(limit)}
    if underlying:
        params["underlying"] = f"eq.{underlying.upper()}"
    return await _read("orders", params)


@router.get("/signals")
async def signals(
    limit: int = Query(100, ge=1, le=500),
    underlying: str | None = None,
    actionable: bool | None = None,
):
    _guard()
    params = {"select": "*", "order": "captured_at.desc", "limit": str(limit)}
    if underlying:
        params["underlying"] = f"eq.{underlying.upper()}"
    if actionable is not None:
        params["actionable"] = f"eq.{str(actionable).lower()}"
    return await _read("signals", params)


@router.get("/events")
async def events(
    limit: int = Query(100, ge=1, le=500),
    kind: str | None = None,
):
    _guard()
    params = {"select": "*", "order": "ts.desc", "limit": str(limit)}
    if kind:
        params["kind"] = f"eq.{kind.upper()}"
    return await _read("risk_events", params)


@router.get("/performance")
async def performance():
    """Per-session, per-index P&L rollup from the `session_performance` view."""
    _guard()
    return await _read("session_performance", {"select": "*"})
