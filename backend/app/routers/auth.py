"""Authentication routes — SmartAPI login, session status and RMS margin."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ..schemas import LoginRequest, RmsBalance, SessionStatus
from ..smart_api import SmartApiError, smart_api
from ..state import ENGINE

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _status(message: str | None = None) -> SessionStatus:
    return SessionStatus(
        authenticated=smart_api.authenticated,
        client_code=smart_api.client_code or None,
        feed_connected=ENGINE.feed_connected,
        mode=ENGINE.mode,
        login_time=(
            smart_api.login_time.isoformat(timespec="seconds")
            if smart_api.login_time
            else None
        ),
        state=smart_api.state,
        message=message,
    )


@router.post("/login", response_model=SessionStatus)
async def login(payload: LoginRequest) -> SessionStatus:
    """Establish an Angel One session with client code, PIN and TOTP.

    ``totp`` is the six-digit code currently shown on the user's authenticator
    app.  It is forwarded to SmartAPI as-is and never persisted — the session
    that comes back stays valid until midnight IST, at which point the user
    re-enters a fresh code.
    """
    try:
        await smart_api.login(
            client_code=payload.client_code,
            pin=payload.pin,
            api_key=payload.api_key,
            totp=payload.totp,
            state=payload.state,
        )
    except SmartApiError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    await ENGINE.start_feed()
    try:
        rms = await smart_api.get_rms()
        ENGINE.live_capital = float(rms.get("net") or 0.0) or None
    except SmartApiError:
        ENGINE.live_capital = None

    ENGINE.log_event("INFO", f"SmartAPI session established for {payload.client_code}.")
    return _status("SmartAPI session established.")


@router.post("/logout", response_model=SessionStatus)
async def logout() -> SessionStatus:
    await ENGINE.stop_feed()
    smart_api.logout()
    ENGINE.live_capital = None
    ENGINE.log_event("INFO", "SmartAPI session terminated.")
    return _status("Session terminated.")


@router.get("/status", response_model=SessionStatus)
async def status() -> SessionStatus:
    return _status()


@router.post("/refresh", response_model=SessionStatus)
async def refresh() -> SessionStatus:
    try:
        await smart_api.refresh_session()
    except SmartApiError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    await ENGINE.start_feed()
    return _status("Session tokens refreshed.")


@router.get("/rms", response_model=RmsBalance)
async def rms() -> RmsBalance:
    """Available margin used for pre-trade leverage checks."""
    if not smart_api.authenticated:
        ledger = ENGINE.ledger
        return RmsBalance(
            net=ledger.equity,
            available_cash=ledger.capital,
            utilised_debits=ledger.deployed,
            source="paper",
        )
    try:
        data = await smart_api.get_rms()
    except SmartApiError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    def _f(key: str) -> float:
        try:
            return float(data.get(key) or 0.0)
        except (TypeError, ValueError):
            return 0.0

    ENGINE.live_capital = _f("net") or None
    return RmsBalance(
        net=_f("net"),
        available_cash=_f("availablecash"),
        utilised_debits=_f("utiliseddebits"),
        source="live",
    )
