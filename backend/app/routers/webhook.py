"""Angel One postback receiver.

This is the endpoint to register as the **Post back URL** when creating a
SmartAPI app.  Angel One POSTs an order-status update here on every state change
(open → complete / rejected / cancelled), which saves the terminal from polling
the order book.

The endpoint is intentionally permissive about the payload shape — Angel One has
shipped several variants — and it never trusts the body for anything except
display and status reconciliation of orders the engine itself placed.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Request

from ..state import ENGINE

log = logging.getLogger("deltak.postback")

router = APIRouter(prefix="/api/webhook", tags=["webhook"])

_TERMINAL_STATES = {"complete", "rejected", "cancelled", "canceled"}


def _pick(payload: dict[str, Any], *keys: str) -> str | None:
    for key in keys:
        value = payload.get(key)
        if value not in (None, ""):
            return str(value)
    return None


@router.post("/postback")
async def postback(request: Request) -> dict:
    """Receive an Angel One order postback.

    Always answers ``200`` — a non-2xx reply makes Angel One retry, and a
    malformed postback is not worth a retry storm.
    """
    try:
        payload = await request.json()
    except Exception:  # noqa: BLE001 — form-encoded or empty body
        payload = dict(await request.form()) if await request.body() else {}

    if not isinstance(payload, dict):
        payload = {"raw": payload}

    order_id = _pick(payload, "orderid", "orderID", "uniqueorderid")
    status = (_pick(payload, "status", "orderstatus") or "").lower()
    symbol = _pick(payload, "tradingsymbol", "symbolname") or "?"
    filled = _pick(payload, "averageprice", "price")

    ENGINE.log_event(
        "INFO",
        f"Postback · {symbol} · order {order_id or '—'} · {status or 'update'}"
        + (f" @ {filled}" if filled else ""),
    )

    # Reconcile the local book: a rejected/cancelled order should not linger as
    # an open position in the HUD.
    if order_id and status in _TERMINAL_STATES and status != "complete":
        for pos in ENGINE.ledger.open_positions:
            if pos.id == order_id or pos.trading_symbol == symbol:
                ENGINE.ledger.close_position(pos.id, pos.avg_price, reason=status.upper())
                ENGINE.log_event(
                    "INFO",
                    f"Order {order_id} {status} — reverted local position {pos.id}.",
                    pos.underlying,
                )
                break

    log.info("postback received: order=%s status=%s", order_id, status)
    return {"ok": True}
