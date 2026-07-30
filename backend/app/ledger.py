"""Virtual execution ledger.

Backs Paper Mode end-to-end (simulated fills with slippage, live mark-to-market
from the WebSocket LTP feed, realised/unrealised PnL) and doubles as the local
book of record in Live Mode so the HUD can render positions and PnL without
polling Angel One on every frame.
"""

from __future__ import annotations

import itertools
import threading
from datetime import datetime

from .config import settings
from .schemas import (
    ExecutionMode,
    LedgerSnapshot,
    OptionType,
    Position,
    Protocol,
    Side,
)
from .ws_manager import TickStore


def apply_slippage(price: float, side: Side, pct: float | None = None) -> float:
    """Model marketable-order slippage: buys fill up, sells fill down."""
    pct = settings.paper_slippage_pct if pct is None else pct
    if price <= 0:
        return price
    factor = (1.0 + pct) if side is Side.BUY else (1.0 - pct)
    return round(max(0.05, price * factor), 2)


class Ledger:
    """Thread-safe position book with mark-to-market PnL."""

    def __init__(self, capital: float | None = None) -> None:
        self.starting_capital = float(
            capital if capital is not None else settings.paper_capital
        )
        self.capital = self.starting_capital
        self.charges = 0.0
        self.realised = 0.0
        self._positions: dict[str, Position] = {}
        self._closed: list[Position] = []
        self._ids = itertools.count(1)
        self._lock = threading.RLock()

    # ------------------------------------------------------------------ #
    def _next_id(self) -> str:
        return f"DK-{datetime.now():%H%M%S}-{next(self._ids):03d}"

    def open_position(
        self,
        *,
        underlying: str,
        token: str,
        trading_symbol: str,
        quantity: int,
        lots: int,
        lot_size: int,
        price: float,
        side: Side = Side.BUY,
        option_type: OptionType | None = None,
        strike: float | None = None,
        stop_loss: float | None = None,
        target: float | None = None,
        protocol: Protocol | None = None,
        mode: ExecutionMode = ExecutionMode.PAPER,
        charge: float | None = None,
    ) -> Position:
        with self._lock:
            pos = Position(
                id=self._next_id(),
                underlying=underlying,
                token=token,
                trading_symbol=trading_symbol,
                option_type=option_type,
                strike=strike,
                side=side,
                quantity=quantity,
                lots=lots,
                lot_size=lot_size,
                avg_price=round(price, 2),
                ltp=round(price, 2),
                stop_loss=stop_loss,
                target=target,
                protocol=protocol,
                opened_at=datetime.now().isoformat(timespec="seconds"),
                mode=mode,
            )
            self._positions[pos.id] = pos
            cost = settings.paper_cost_per_order if charge is None else charge
            self.charges += cost
            self.capital -= cost
            return pos

    def close_position(
        self, position_id: str, price: float, reason: str = "MANUAL"
    ) -> Position | None:
        with self._lock:
            pos = self._positions.pop(position_id, None)
            if pos is None:
                return None
            exit_price = round(price, 2)
            direction = 1 if pos.side is Side.BUY else -1
            pnl = (exit_price - pos.avg_price) * pos.quantity * direction
            cost = settings.paper_cost_per_order
            pos.exit_price = exit_price
            pos.exit_reason = reason
            pos.realised_pnl = round(pnl, 2)
            pos.unrealised_pnl = 0.0
            pos.ltp = exit_price
            pos.pnl_pct = (
                round((exit_price - pos.avg_price) / pos.avg_price * 100.0 * direction, 2)
                if pos.avg_price
                else 0.0
            )
            pos.status = "CLOSED"
            pos.closed_at = datetime.now().isoformat(timespec="seconds")
            self.realised += pos.realised_pnl
            self.charges += cost
            self.capital += pos.realised_pnl - cost
            self._closed.append(pos)
            return pos

    def reduce_position(
        self, position_id: str, lots: int, price: float, reason: str = "TP1"
    ) -> Position | None:
        """Scale out of part of a position (Weakening-quadrant TP1 protocol)."""
        with self._lock:
            pos = self._positions.get(position_id)
            if pos is None or lots <= 0:
                return None
            if lots >= pos.lots:
                return self.close_position(position_id, price, reason)

            qty = lots * pos.lot_size
            direction = 1 if pos.side is Side.BUY else -1
            pnl = (round(price, 2) - pos.avg_price) * qty * direction
            pos.lots -= lots
            pos.quantity -= qty
            pos.realised_pnl = round(pos.realised_pnl + pnl, 2)
            self.realised += round(pnl, 2)
            self.capital += round(pnl, 2)
            return pos

    # ------------------------------------------------------------------ #
    def mark_to_market(self, ticks: TickStore) -> None:
        """Refresh LTP and unrealised PnL for every open position."""
        with self._lock:
            for pos in self._positions.values():
                ltp = ticks.ltp(pos.token, pos.ltp)
                if ltp <= 0:
                    continue
                direction = 1 if pos.side is Side.BUY else -1
                pos.ltp = round(ltp, 2)
                pos.unrealised_pnl = round(
                    (ltp - pos.avg_price) * pos.quantity * direction, 2
                )
                pos.pnl_pct = (
                    round((ltp - pos.avg_price) / pos.avg_price * 100.0 * direction, 2)
                    if pos.avg_price
                    else 0.0
                )

    # ------------------------------------------------------------------ #
    @property
    def open_positions(self) -> list[Position]:
        with self._lock:
            return list(self._positions.values())

    def get(self, position_id: str) -> Position | None:
        return self._positions.get(position_id)

    def positions_for(self, underlying: str) -> list[Position]:
        return [p for p in self.open_positions if p.underlying == underlying]

    @property
    def open_pnl(self) -> float:
        return round(sum(p.unrealised_pnl for p in self.open_positions), 2)

    @property
    def deployed(self) -> float:
        return round(
            sum(p.avg_price * p.quantity for p in self.open_positions), 2
        )

    @property
    def equity(self) -> float:
        return round(self.capital + self.open_pnl, 2)

    def snapshot(self, mode: ExecutionMode) -> LedgerSnapshot:
        with self._lock:
            return LedgerSnapshot(
                mode=mode,
                capital=round(self.capital, 2),
                equity=self.equity,
                open_positions=self.open_positions,
                closed_positions=self._closed[-25:],
                open_pnl=self.open_pnl,
                realised_pnl=round(self.realised, 2),
                total_pnl=round(self.realised + self.open_pnl, 2),
                deployed_margin=self.deployed,
                charges=round(self.charges, 2),
            )

    def reset(self, capital: float | None = None) -> None:
        with self._lock:
            self.starting_capital = float(
                capital if capital is not None else self.starting_capital
            )
            self.capital = self.starting_capital
            self.realised = 0.0
            self.charges = 0.0
            self._positions.clear()
            self._closed.clear()
