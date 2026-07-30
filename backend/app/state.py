"""Delta-K engine state — the single source of truth the HUD renders.

One :class:`EngineState` instance owns the scrip master projection, the tick
store, the per-underlying RRG / COA / signal engines, the execution ledger and
the risk-event log.  :meth:`EngineState.refresh` runs one full pass of the
pipeline (feed → chain → RRG → protocol → signal → mark-to-market) and is driven
both by the stream broadcaster and by the risk loop.
"""

from __future__ import annotations

import asyncio
import logging
from collections import deque
from datetime import datetime, timedelta

from .config import EXCHANGE_NSE_CM, EXCHANGE_NSE_FO, INDEX_UNIVERSE, IST, settings
from .engine.coa import ChainBuilder
from .engine.dkms import SignalEngine
from .db import DB
from .engine.rrg import RrgEngine
from .ledger import Ledger
from .schemas import (
    EngineSnapshot,
    ExecutionMode,
    OptionChain,
    RiskEvent,
    RrgNode,
    Signal,
)
from .scrip_master import MASTER, ScripMaster
from .sim_feed import SIM_FEED
from .smart_api import smart_api
from .ws_manager import STREAM, TICKS

log = logging.getLogger("deltak.state")


def now_ist() -> datetime:
    return datetime.now(IST)


def seconds_to_daylight_rest(now: datetime | None = None) -> int:
    """Seconds until the 3:15 PM IST Daylight Rest Protocol fires (0 if passed)."""
    now = now or now_ist()
    target = now.replace(
        hour=settings.daylight_rest.hour,
        minute=settings.daylight_rest.minute,
        second=0,
        microsecond=0,
    )
    if now >= target:
        return 0
    return int((target - now).total_seconds())


def is_market_open(now: datetime | None = None) -> bool:
    now = now or now_ist()
    if now.weekday() >= 5:  # Sat / Sun
        return False
    return settings.market_open <= now.time() <= settings.market_close


class EngineState:
    def __init__(self) -> None:
        self.master: ScripMaster = MASTER
        self.ticks = TICKS
        self.stream = STREAM
        self.ledger = Ledger()
        self.mode: ExecutionMode = ExecutionMode(settings.execution_mode)

        self.rrg: dict[str, RrgEngine] = {u: RrgEngine() for u in INDEX_UNIVERSE}
        self.builders: dict[str, ChainBuilder] = {
            u: ChainBuilder(u, self.rrg[u]) for u in INDEX_UNIVERSE
        }
        self.signals_engines: dict[str, SignalEngine] = {
            u: SignalEngine(u, self.builders[u], self.rrg[u]) for u in INDEX_UNIVERSE
        }

        self.chains: dict[str, OptionChain] = {}
        self.signals: dict[str, Signal] = {}
        self.events: deque[RiskEvent] = deque(maxlen=100)
        self.risk_pct: float = settings.risk_pct_per_trade
        self.live_capital: float | None = None
        self.daylight_rest_done: bool = False
        #: Fingerprint of the last persisted signal, per underlying.
        self._signal_marks: dict[str, tuple] = {}
        self._last_refresh: datetime | None = None
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------ #
    # feed wiring
    # ------------------------------------------------------------------ #
    @property
    def simulating(self) -> bool:
        return SIM_FEED.running

    @property
    def feed_connected(self) -> bool:
        return self.stream.connected or SIM_FEED.running

    def attach_master(self, master: ScripMaster) -> None:
        self.master = master

    async def start_feed(self) -> None:
        """Start the live SmartStream feed, or the simulator when configured."""
        if smart_api.authenticated and smart_api.feed_token:
            await SIM_FEED.stop()
            await self.stream.start(
                smart_api.client_code, smart_api.feed_token, smart_api.api_key
            )
            self.track_universe()
            await self.stream.sync_subscriptions()
            self.log_event("INFO", "SmartStream 2.0 feed engaged (mode 3 snap quote).")
        elif settings.simulate:
            await SIM_FEED.start(self.master, settings.stream_interval)
            self.log_event("INFO", "Simulated feed engaged — prints are synthetic.")

    async def stop_feed(self) -> None:
        await self.stream.stop()
        await SIM_FEED.stop()

    def track_universe(self) -> list[tuple[int, set[str]]]:
        """Track index spots plus the near-ATM option window for every index."""
        spot_tokens = {
            inst.token for inst in self.master.spots.values() if inst.token
        }
        self.stream.track(EXCHANGE_NSE_CM, spot_tokens)

        option_tokens: set[str] = set()
        for underlying, cfg in INDEX_UNIVERSE.items():
            spot = self.spot(underlying)
            step = float(cfg["strike_step"])
            band = step * (settings.chain_depth + 2)
            for inst in self.master.contracts(underlying):
                if spot <= 0 or abs(inst.strike - spot) <= band:
                    option_tokens.add(inst.token)
        self.stream.track(EXCHANGE_NSE_FO, option_tokens)
        return [(EXCHANGE_NSE_CM, spot_tokens), (EXCHANGE_NSE_FO, option_tokens)]

    async def resync_universe(self) -> None:
        """Subscribe any strikes that drifted into range as spot moved."""
        if not self.stream.connected:
            return
        for exch, tokens in self.track_universe():
            await self.stream.subscribe_new(exch, tokens)

    # ------------------------------------------------------------------ #
    # pipeline
    # ------------------------------------------------------------------ #
    def spot(self, underlying: str) -> float:
        inst = self.master.spots.get(underlying)
        if not inst:
            return 0.0
        return self.ticks.ltp(inst.token)

    def capital(self) -> float:
        """Capital used for sizing: live RMS balance if known, else the ledger."""
        if self.mode is ExecutionMode.LIVE and self.live_capital is not None:
            return self.live_capital
        return self.ledger.equity

    async def refresh(self, advance_rrg: bool = True) -> None:
        """Run one full pipeline pass."""
        async with self._lock:
            self.ledger.mark_to_market(self.ticks)
            capital = self.capital()
            free = max(0.0, capital - self.ledger.deployed)

            for underlying in INDEX_UNIVERSE:
                spot = self.spot(underlying)
                chain = self.builders[underlying].build(
                    self.master, self.ticks, spot, advance_rrg=advance_rrg
                )
                self.chains[underlying] = chain
                signal = self.signals_engines[underlying].evaluate(
                    chain,
                    self.master,
                    capital=capital,
                    risk_pct=self.risk_pct,
                    max_deployable=free,
                )
                self.signals[underlying] = signal
                self._persist_signal_change(signal, chain)
            self._last_refresh = datetime.now()

    def _persist_signal_change(self, signal: Signal, chain: OptionChain) -> None:
        """Persist a signal only when its *state* changes.

        The engine re-evaluates every second; writing each evaluation would bury
        the useful transitions under thousands of identical rows.
        """
        mark = (
            signal.protocol,
            signal.actionable,
            signal.blocked_reason,
            signal.trading_symbol,
        )
        if self._signal_marks.get(signal.underlying) == mark:
            return
        self._signal_marks[signal.underlying] = mark
        DB.record_signal(signal, spot=chain.spot, pcr=chain.pcr)

    # ------------------------------------------------------------------ #
    # projections
    # ------------------------------------------------------------------ #
    def rrg_nodes(self, underlying: str) -> list[RrgNode]:
        """Active strike nodes for the scatter plot — the ATM neighbourhood only."""
        chain = self.chains.get(underlying)
        if not chain:
            return []
        nodes: list[RrgNode] = []
        engine = self.rrg[underlying]
        span = INDEX_UNIVERSE[underlying]["strike_step"] * settings.rrg_node_span
        for row in chain.rows:
            if chain.atm_strike and abs(row.strike - chain.atm_strike) > span:
                continue
            for leg, opt_type in ((row.call, "CE"), (row.put, "PE")):
                if leg is None or leg.rs_ratio is None or leg.quadrant is None:
                    continue
                if leg.ltp <= 0 or not engine.matured(leg.token):
                    continue
                nodes.append(
                    RrgNode(
                        token=leg.token,
                        label=f"{int(row.strike)}{opt_type}",
                        strike=row.strike,
                        option_type=opt_type,  # type: ignore[arg-type]
                        rs_ratio=leg.rs_ratio,
                        rs_momentum=leg.rs_momentum or 100.0,
                        quadrant=leg.quadrant,
                        tail=engine.tail(leg.token),
                    )
                )
        return nodes

    def spots_payload(self) -> dict[str, dict]:
        payload = {}
        for underlying, cfg in INDEX_UNIVERSE.items():
            inst = self.master.spots.get(underlying)
            token = inst.token if inst else None
            ltp = self.ticks.ltp(token) if token else 0.0
            prev = self.ticks.prev_ltp(token) if token else 0.0
            tick = self.ticks.get(token) if token else None
            close = tick.close if tick else 0.0
            payload[underlying] = {
                "underlying": underlying,
                "label": cfg["label"],
                "token": token,
                "ltp": round(ltp, 2),
                "prev": round(prev, 2),
                "direction": 0 if prev == 0 or ltp == prev else (1 if ltp > prev else -1),
                "change": round(ltp - close, 2) if close else 0.0,
                "change_pct": round((ltp - close) / close * 100, 2) if close else 0.0,
            }
        return payload

    def log_event(self, kind: str, message: str, underlying: str | None = None) -> RiskEvent:
        event = RiskEvent(
            ts=datetime.now().isoformat(timespec="seconds"),
            kind=kind,  # type: ignore[arg-type]
            underlying=underlying,
            message=message,
        )
        self.events.appendleft(event)
        DB.record_event(event)
        log.info("[%s] %s", kind, message)
        return event

    def snapshot(self) -> EngineSnapshot:
        return EngineSnapshot(
            ts=datetime.now().isoformat(timespec="seconds"),
            mode=self.mode,
            authenticated=smart_api.authenticated,
            feed_connected=self.feed_connected,
            market_open=is_market_open(),
            seconds_to_daylight_rest=seconds_to_daylight_rest(),
            spots=self.spots_payload(),
            chains=self.chains,
            rrg={u: self.rrg_nodes(u) for u in INDEX_UNIVERSE},
            signals=self.signals,
            ledger=self.ledger.snapshot(self.mode),
            events=list(self.events)[:20],
        )

    def status(self) -> dict:
        return {
            "mode": self.mode.value,
            "authenticated": smart_api.authenticated,
            "client_code": smart_api.client_code or None,
            "feed_connected": self.stream.connected,
            "simulated": self.simulating,
            "tracked_tokens": self.stream.tracked_count,
            "tick_updates": self.ticks.updates,
            "master_ready": self.master.ready,
            "market_open": is_market_open(),
            "seconds_to_daylight_rest": seconds_to_daylight_rest(),
            "daylight_rest_done": self.daylight_rest_done,
            "risk_pct": self.risk_pct,
            "capital": self.capital(),
            "last_refresh": self._last_refresh.isoformat() if self._last_refresh else None,
            "stream_error": self.stream.last_error,
            "reconnects": self.stream.reconnects,
        }

    def reset_session_day(self) -> None:
        """Clear per-day state (called when the calendar day rolls over)."""
        self.ticks.reset_session()
        for engine in self.rrg.values():
            engine.reset()
        self.daylight_rest_done = False
        self.log_event("INFO", "Session state reset for a new trading day.")


ENGINE = EngineState()


def next_session_reset(now: datetime | None = None) -> datetime:
    now = now or now_ist()
    target = now.replace(hour=8, minute=45, second=0, microsecond=0)
    if now >= target:
        target += timedelta(days=1)
    return target
