"""Capital-preservation circuit breakers and the background cron routine.

Guards, evaluated on every loop iteration:

* **Stop loss / target** — per-position premium stops booked from the signal.
* **0.35 % Index Break Invalidation** — if spot breaches Aegis-1 (for longs via
  calls) or Zenith-1 (for puts) by more than 0.35 %, every position on that
  underlying is liquidated immediately with a market exit.
* **Weakening rotation** — a node rotating into the Weakening quadrant triggers
  an automated TP1 scale-out instead of a full exit.
* **3:15 PM IST Daylight Rest Protocol** — 100 % of open positions are flattened
  before the 3:30 PM close so nothing is carried overnight.
"""

from __future__ import annotations

import asyncio
import logging

from .config import INDEX_UNIVERSE, settings
from .db import DB
from .execution import close_position, panic_flatten, scale_out
from .schemas import OptionType, Quadrant, Side
from .state import ENGINE, is_market_open, now_ist, seconds_to_daylight_rest
from .stream_hub import HUB

log = logging.getLogger("deltak.risk")

#: Positions already scaled out once — keyed by position id.
_scaled: set[str] = set()


# --------------------------------------------------------------------------- #
# individual guards
# --------------------------------------------------------------------------- #
async def check_stops() -> None:
    """Book stop-loss and target exits from live premium marks."""
    for pos in list(ENGINE.ledger.open_positions):
        ltp = ENGINE.ticks.ltp(pos.token)
        if ltp <= 0:
            continue
        long = pos.side is Side.BUY
        if pos.stop_loss is not None:
            hit = ltp <= pos.stop_loss if long else ltp >= pos.stop_loss
            if hit:
                ENGINE.log_event(
                    "STOP_LOSS",
                    f"Stop hit on {pos.trading_symbol} @ {ltp:.2f} "
                    f"(stop {pos.stop_loss:.2f}) — liquidating.",
                    pos.underlying,
                )
                await close_position(pos.id, reason="STOP_LOSS")
                continue
        if pos.target is not None:
            hit = ltp >= pos.target if long else ltp <= pos.target
            if hit:
                ENGINE.log_event(
                    "TARGET",
                    f"Target hit on {pos.trading_symbol} @ {ltp:.2f} — booking.",
                    pos.underlying,
                )
                await close_position(pos.id, reason="TARGET")


def breach(spot: float, level: float | None, direction: str) -> bool:
    """True when spot has breached *level* by more than the invalidation band.

    ``direction`` is ``"below"`` for an Aegis (support) break or ``"above"`` for
    a Zenith (resistance) break.
    """
    if not level or level <= 0 or spot <= 0:
        return False
    band = level * (settings.invalidation_pct / 100.0)
    return spot < level - band if direction == "below" else spot > level + band


async def check_invalidation() -> None:
    """0.35 % index break invalidation against the COA 2.0 bounds."""
    for underlying in INDEX_UNIVERSE:
        chain = ENGINE.chains.get(underlying)
        if not chain or chain.spot <= 0:
            continue
        levels = chain.levels
        support_broken = breach(chain.spot, levels.aegis_1, "below")
        resistance_broken = breach(chain.spot, levels.zenith_1, "above")
        if not (support_broken or resistance_broken):
            continue

        for pos in ENGINE.ledger.positions_for(underlying):
            invalid = (
                support_broken
                and pos.option_type is OptionType.CE
                and pos.side is Side.BUY
            ) or (
                resistance_broken
                and pos.option_type is OptionType.PE
                and pos.side is Side.BUY
            )
            if not invalid:
                continue
            level = levels.aegis_1 if support_broken else levels.zenith_1
            label = "Aegis-1" if support_broken else "Zenith-1"
            ENGINE.log_event(
                "INVALIDATION",
                f"{underlying} spot {chain.spot:,.2f} breached {label} {level:,.0f} by "
                f">{settings.invalidation_pct}% — liquidating {pos.trading_symbol}.",
                underlying,
            )
            await close_position(pos.id, reason="INVALIDATION")


async def check_weakening_rotation() -> None:
    """Automated TP1 scale-out when a held node rotates into Weakening."""
    for pos in list(ENGINE.ledger.open_positions):
        if pos.id in _scaled or pos.lots < 2:
            continue
        quadrant = ENGINE.rrg[pos.underlying].quadrant(pos.token)
        if quadrant is not Quadrant.WEAKENING:
            continue
        if pos.unrealised_pnl <= 0:
            continue  # only scale out of a winner
        ENGINE.log_event(
            "TARGET",
            f"{pos.trading_symbol} rotated into Weakening — TP1 scale-out.",
            pos.underlying,
        )
        await scale_out(pos.id, fraction=0.5)
        _scaled.add(pos.id)


async def check_daylight_rest() -> None:
    """3:15 PM IST — flatten everything ahead of the 3:30 PM close."""
    if ENGINE.daylight_rest_done:
        return
    if seconds_to_daylight_rest() > 0:
        return
    now = now_ist()
    if now.weekday() >= 5 or now.time() > settings.market_close:
        ENGINE.daylight_rest_done = True
        return
    if ENGINE.ledger.open_positions:
        ENGINE.log_event(
            "DAYLIGHT_REST",
            "3:15 PM IST Daylight Rest Protocol — flattening 100% of open positions.",
        )
        await panic_flatten(reason="DAYLIGHT_REST")
    ENGINE.daylight_rest_done = True


# --------------------------------------------------------------------------- #
# loops
# --------------------------------------------------------------------------- #
async def sync_open_positions() -> None:
    """Checkpoint open-position marks to the database.

    Lifecycle events (open / scale / close) are persisted immediately; this only
    refreshes the mark-to-market of still-open rows, so it runs on a slow timer
    instead of every tick.
    """
    for pos in ENGINE.ledger.open_positions:
        DB.record_position(pos)


async def risk_loop() -> None:
    """Continuous guard evaluation.  Never exits on a single guard failure."""
    resync_countdown = 0
    sync_countdown = 0
    last_day = now_ist().date()
    while True:
        try:
            await ENGINE.refresh()
            await check_stops()
            await check_invalidation()
            await check_weakening_rotation()
            await check_daylight_rest()

            resync_countdown -= 1
            if resync_countdown <= 0:
                await ENGINE.resync_universe()
                resync_countdown = 30

            sync_countdown -= 1
            if sync_countdown <= 0:
                await sync_open_positions()
                sync_countdown = max(
                    1,
                    int(settings.db_position_sync_interval / settings.risk_loop_interval),
                )

            today = now_ist().date()
            if today != last_day:
                last_day = today
                _scaled.clear()
                ENGINE.reset_session_day()
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 — a guard must never kill the loop
            log.exception("risk loop iteration failed")
        await asyncio.sleep(settings.risk_loop_interval)


async def broadcast_loop() -> None:
    """Push an :class:`EngineSnapshot` to every connected HUD client."""
    while True:
        try:
            if HUB.has_clients:
                await HUB.publish(ENGINE.snapshot())
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            log.exception("broadcast loop iteration failed")
        await asyncio.sleep(settings.stream_interval)


def market_status() -> dict:
    return {
        "market_open": is_market_open(),
        "seconds_to_daylight_rest": seconds_to_daylight_rest(),
        "daylight_rest_done": ENGINE.daylight_rest_done,
        "now_ist": now_ist().isoformat(timespec="seconds"),
    }
