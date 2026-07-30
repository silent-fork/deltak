"""Synthetic tick generator for offline development.

Enabled with ``DK_SIMULATE=1``.  It only runs when no SmartAPI session is
active, and the HUD renders a persistent ``SIMULATED FEED`` badge whenever it is
driving the terminal — simulated prints must never be mistaken for live ones.

The model is deliberately simple but structurally faithful: a mean-reverting
random walk on each index, Black-Scholes-ish intrinsic + time value on each
option, and open interest that accumulates around the walls so the COA 2.0
Aegis/Zenith logic has something real to chew on.
"""

from __future__ import annotations

import asyncio
import math
import random
from datetime import datetime

from .config import INDEX_UNIVERSE
from .schemas import Tick
from .scrip_master import ScripMaster
from .ws_manager import TICKS, TickStore

SEED_SPOT = {"NIFTY": 24_500.0, "BANKNIFTY": 52_000.0, "FINNIFTY": 23_400.0}
IV = 0.14


def _premium(spot: float, strike: float, option_type: str, t_years: float) -> float:
    """Cheap approximation: intrinsic + Brownian time value."""
    intrinsic = max(0.0, spot - strike) if option_type == "CE" else max(0.0, strike - spot)
    time_value = spot * IV * math.sqrt(max(t_years, 1e-4)) * 0.4
    moneyness_decay = math.exp(-((spot - strike) ** 2) / (2 * (spot * 0.02) ** 2))
    return round(max(0.05, intrinsic + time_value * moneyness_decay), 2)


class SimulatedFeed:
    """Drives a :class:`TickStore` with plausible index and option prints."""

    def __init__(self, store: TickStore) -> None:
        self.store = store
        self.running = False
        self._task: asyncio.Task | None = None
        self._spot: dict[str, float] = dict(SEED_SPOT)
        self._anchor: dict[str, float] = dict(SEED_SPOT)
        self._oi: dict[str, int] = {}
        self._tick_no = 0

    async def start(self, master: ScripMaster, interval: float = 1.0) -> None:
        await self.stop()
        self.running = True
        self._task = asyncio.create_task(
            self._loop(master, interval), name="sim-feed"
        )

    async def stop(self) -> None:
        self.running = False
        if self._task and not self._task.done():
            self._task.cancel()
            try:
                await self._task
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        self._task = None

    async def _loop(self, master: ScripMaster, interval: float) -> None:
        try:
            while self.running:
                self.step(master)
                await asyncio.sleep(interval)
        except asyncio.CancelledError:
            return

    # ------------------------------------------------------------------ #
    def step(self, master: ScripMaster) -> None:
        """Advance the simulation by one frame."""
        self._tick_no += 1
        today = datetime.now().date()

        for underlying, cfg in INDEX_UNIVERSE.items():
            anchor = self._anchor[underlying]
            spot = self._spot[underlying]
            # Ornstein-Uhlenbeck style drift back toward the session anchor.
            spot += (anchor - spot) * 0.02 + random.gauss(0, anchor * 0.0006)
            self._spot[underlying] = spot

            spot_inst = master.spots.get(underlying)
            if spot_inst:
                self.store.apply(
                    Tick(
                        token=spot_inst.token,
                        ltp=round(spot, 2),
                        close=round(anchor, 2),
                        open=round(anchor, 2),
                        high=round(max(spot, anchor), 2),
                        low=round(min(spot, anchor), 2),
                        exchange_ts=int(datetime.now().timestamp() * 1000),
                    )
                )

            expiry = master.nearest_expiry(underlying)
            if not expiry:
                continue
            t_years = max((expiry - today).days, 0) / 365.0

            step = float(cfg["strike_step"])
            for inst in master.contracts(underlying, expiry):
                if abs(inst.strike - spot) > step * 14:
                    continue
                px = _premium(spot, inst.strike, inst.option_type or "CE", t_years)
                px = round(px * random.uniform(0.997, 1.003), 2)

                base = self._oi.get(inst.token)
                if base is None:
                    base = int(abs(random.gauss(0, 1)) * 200_000) + 25_000
                    self._oi[inst.token] = base
                # Writers pile in one step below spot (puts) / above spot (calls).
                pull = math.exp(-abs(inst.strike - spot) / (step * 4))
                growth = int(pull * random.uniform(-400, 1400))
                self._oi[inst.token] = max(1000, self._oi[inst.token] + growth)

                self.store.apply(
                    Tick(
                        token=inst.token,
                        ltp=px,
                        close=round(px * 0.98, 2),
                        volume=int(pull * random.uniform(1e4, 8e4)),
                        oi=self._oi[inst.token],
                        oi_change_pct=round(growth / max(base, 1) * 100, 3),
                        best_bid=round(px * 0.998, 2),
                        best_ask=round(px * 1.002, 2),
                        exchange_ts=int(datetime.now().timestamp() * 1000),
                    )
                )


SIM_FEED = SimulatedFeed(TICKS)
