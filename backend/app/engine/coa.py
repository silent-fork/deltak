"""Chart of Accuracy (COA 1.0 & 2.0) option-chain assembler.

COA 1.0 reads the *cumulative* open-interest walls — the static Aegis (support)
and Zenith (resistance) bounds carried into the session.  COA 2.0 reads the
*intraday change* in open interest, which is what actually moves during the day
and which the Delta-K driver trades: writers adding puts below spot lift Aegis-1,
writers adding calls above spot pin Zenith-1.

The builder also stamps every leg with its moneyness / ITM depth (for the
Zero-OTM rule) and its RRG quadrant, and marks the Quantum Horizon — the
neon-cyan ATM separator the HUD draws through the matrix.
"""

from __future__ import annotations

from collections import deque
from datetime import date, datetime

from ..config import INDEX_UNIVERSE, settings
from ..schemas import (
    ChainRow,
    CoaLevels,
    Moneyness,
    OptionChain,
    OptionLeg,
    OptionType,
)
from ..scrip_master import Instrument, ScripMaster
from ..ws_manager import TickStore
from .rrg import RrgEngine


def nearest_strike(spot: float, strikes: list[float]) -> float:
    """The listed strike closest to spot (the ATM anchor)."""
    if not strikes:
        return 0.0
    return min(strikes, key=lambda s: abs(s - spot))


def itm_depth(strike: float, spot: float, option_type: str, step: float) -> int:
    """How many strikes In-The-Money a contract sits, in strike-step units.

    Positive = ITM, 0 = ATM, negative = OTM.
    """
    if step <= 0:
        return 0
    if option_type == "CE":
        raw = (spot - strike) / step
    else:
        raw = (strike - spot) / step
    return int(round(raw))


class ChainBuilder:
    """Assembles the live 4-quadrant matrix for a single underlying."""

    def __init__(self, underlying: str, rrg: RrgEngine) -> None:
        self.underlying = underlying
        self.cfg = INDEX_UNIVERSE[underlying]
        self.rrg = rrg
        #: Rolling history of COA 2.0 levels, used to detect level migration.
        self._aegis_hist: deque[float] = deque(maxlen=60)
        self._zenith_hist: deque[float] = deque(maxlen=60)
        self.levels = CoaLevels()

    # ------------------------------------------------------------------ #
    @property
    def strike_step(self) -> float:
        return float(self.cfg["strike_step"])

    def _leg(
        self,
        inst: Instrument,
        ticks: TickStore,
        spot: float,
        with_rrg: bool,
    ) -> OptionLeg:
        tick = ticks.get(inst.token)
        ltp = tick.ltp if tick else 0.0
        close = tick.close if tick else 0.0
        depth = itm_depth(inst.strike, spot, inst.option_type or "CE", self.strike_step)

        if depth > 0:
            moneyness = Moneyness.ITM
        elif depth == 0:
            moneyness = Moneyness.ATM
        else:
            moneyness = Moneyness.OTM

        leg = OptionLeg(
            token=inst.token,
            trading_symbol=inst.symbol,
            ltp=round(ltp, 2),
            change_pct=round((ltp - close) / close * 100.0, 2) if close else 0.0,
            volume=tick.volume if tick else 0,
            oi=tick.oi if tick else 0,
            oi_change=ticks.oi_change(inst.token),
            oi_change_pct=round(tick.oi_change_pct, 2) if tick else 0.0,
            best_bid=round(tick.best_bid, 2) if tick else 0.0,
            best_ask=round(tick.best_ask, 2) if tick else 0.0,
            moneyness=moneyness,
            itm_depth=depth,
        )

        if with_rrg and ltp > 0 and spot > 0:
            point = self.rrg.update(inst.token, ltp, spot)
            leg.rs_ratio = point.rs_ratio
            leg.rs_momentum = point.rs_momentum
            leg.quadrant = self.rrg.quadrant(inst.token)
        else:
            point = self.rrg.point(inst.token)
            if point:
                leg.rs_ratio = point.rs_ratio
                leg.rs_momentum = point.rs_momentum
                leg.quadrant = self.rrg.quadrant(inst.token)
        return leg

    # ------------------------------------------------------------------ #
    def build(
        self,
        master: ScripMaster,
        ticks: TickStore,
        spot: float,
        expiry: date | None = None,
        advance_rrg: bool = True,
    ) -> OptionChain:
        """Produce the full chain snapshot for the current tick frame."""
        expiry = expiry or master.nearest_expiry(self.underlying)
        contracts = master.contracts(self.underlying, expiry)
        spot_tick = ticks.get(master.spots[self.underlying].token) if master.spots.get(
            self.underlying
        ) else None
        spot_close = spot_tick.close if spot_tick else 0.0

        chain = OptionChain(
            underlying=self.underlying,
            label=self.cfg["label"],
            spot=round(spot, 2),
            spot_change_pct=(
                round((spot - spot_close) / spot_close * 100.0, 2) if spot_close else 0.0
            ),
            expiry=expiry.isoformat() if expiry else None,
            updated_at=datetime.now().isoformat(timespec="seconds"),
        )
        if not contracts:
            chain.levels = self.levels
            return chain

        all_strikes = sorted({c.strike for c in contracts})
        atm = nearest_strike(spot, all_strikes)
        chain.atm_strike = atm

        atm_index = all_strikes.index(atm)
        lo = max(0, atm_index - settings.chain_depth)
        hi = min(len(all_strikes), atm_index + settings.chain_depth + 1)
        window = all_strikes[lo:hi]

        by_strike: dict[float, dict[str, Instrument]] = {}
        for c in contracts:
            if c.strike in window and c.option_type:
                by_strike.setdefault(c.strike, {})[c.option_type] = c

        total_call_oi = 0
        total_put_oi = 0
        rows: list[ChainRow] = []
        for strike in window:
            legs = by_strike.get(strike, {})
            call_inst = legs.get("CE")
            put_inst = legs.get("PE")
            row = ChainRow(strike=strike, is_atm=abs(strike - atm) < 1e-6)
            if call_inst:
                row.call = self._leg(call_inst, ticks, spot, advance_rrg)
                total_call_oi += row.call.oi
            if put_inst:
                row.put = self._leg(put_inst, ticks, spot, advance_rrg)
                total_put_oi += row.put.oi
            rows.append(row)

        # The Quantum Horizon sits on the last strike below spot — the boundary
        # between the ITM-call / OTM-put half and its mirror.
        below = [r for r in rows if r.strike <= spot]
        if below:
            below[-1].quantum_horizon = True

        chain.rows = rows
        chain.pcr = round(total_put_oi / total_call_oi, 3) if total_call_oi else 0.0
        chain.levels = self._levels(rows, spot)
        return chain

    # ------------------------------------------------------------------ #
    def _levels(self, rows: list[ChainRow], spot: float) -> CoaLevels:
        """Derive COA 1.0 / COA 2.0 Aegis and Zenith bounds from the matrix."""
        puts_below = [r for r in rows if r.put and r.strike <= spot]
        calls_above = [r for r in rows if r.call and r.strike >= spot]

        levels = CoaLevels()

        # --- COA 1.0: cumulative open-interest walls ---------------------
        if puts_below:
            best = max(puts_below, key=lambda r: r.put.oi)  # type: ignore[union-attr]
            levels.aegis_0 = best.strike if best.put.oi > 0 else None  # type: ignore[union-attr]
        if calls_above:
            best = max(calls_above, key=lambda r: r.call.oi)  # type: ignore[union-attr]
            levels.zenith_0 = best.strike if best.call.oi > 0 else None  # type: ignore[union-attr]

        # --- COA 2.0: intraday OI accumulation ---------------------------
        put_writes = [r for r in puts_below if r.put and r.put.oi_change > 0]
        call_writes = [r for r in calls_above if r.call and r.call.oi_change > 0]
        levels.aegis_1 = (
            max(put_writes, key=lambda r: r.put.oi_change).strike  # type: ignore[union-attr]
            if put_writes
            else levels.aegis_0
        )
        levels.zenith_1 = (
            max(call_writes, key=lambda r: r.call.oi_change).strike  # type: ignore[union-attr]
            if call_writes
            else levels.zenith_0
        )

        if levels.aegis_1 is not None:
            self._aegis_hist.append(levels.aegis_1)
        if levels.zenith_1 is not None:
            self._zenith_hist.append(levels.zenith_1)

        levels.aegis_shift = self._shift(self._aegis_hist)
        levels.zenith_shift = self._shift(self._zenith_hist)
        self.levels = levels
        return levels

    def _shift(self, hist: deque[float]) -> int:
        """Net migration of a level over the history window, in strike steps."""
        if len(hist) < 2 or self.strike_step <= 0:
            return 0
        return int(round((hist[-1] - hist[0]) / self.strike_step))

    # ------------------------------------------------------------------ #
    def select_itm(
        self,
        master: ScripMaster,
        option_type: OptionType,
        spot: float,
        depth: int,
        expiry: date | None = None,
    ) -> Instrument | None:
        """Resolve the *depth*-th ITM contract, honouring the Zero-OTM rule.

        Depth 2 means "second strike deep In-The-Money" relative to the ATM
        anchor.  Returns ``None`` when the contract is not listed.
        """
        strikes = master.strikes(self.underlying, expiry)
        if not strikes:
            return None
        atm = nearest_strike(spot, strikes)
        idx = strikes.index(atm)
        target_idx = idx - depth if option_type == OptionType.CE else idx + depth
        if target_idx < 0 or target_idx >= len(strikes):
            return None
        return master.find(
            self.underlying, strikes[target_idx], option_type.value, expiry
        )
