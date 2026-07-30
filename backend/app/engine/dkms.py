"""The Delta-K Matrix Strategy signal engine.

Regime classification (COA 2.0 level migration)
-----------------------------------------------
============  ==========================  ==========================  ===========
Protocol      Aegis-1 (support)           Zenith-1 (resistance)       Driver
============  ==========================  ==========================  ===========
ALPHA         solid                       solid                       Range scalps at both bounds
BETA          solid                       migrating up                ITM Calls on micro-dips; puts banned
GAMMA         migrating down              solid                       ITM Puts; calls banned
DELTA         both migrating / unclear    both migrating / unclear    Auto-driver muted
============  ==========================  ==========================  ===========

Invariants enforced on every candidate
--------------------------------------
* **Zero-OTM rule** — longs are restricted to the 2nd or 3rd strike deep ITM.
  Anything ATM or OTM is hard-blocked to avoid theta attrition.
* **RRG gate** — a node sitting in the *Lagging* quadrant (RS-Ratio < 100 and
  RS-Momentum < 100) is a high-decay node; long accumulation is forbidden.
* **Directional bans** — Beta bans puts, Gamma bans calls, Delta bans both.
"""

from __future__ import annotations

from datetime import datetime

from ..config import settings
from ..schemas import (
    ChainRow,
    CoaLevels,
    OptionChain,
    OptionType,
    Protocol,
    Quadrant,
    Signal,
    SizingResult,
)
from ..scrip_master import ScripMaster
from .coa import ChainBuilder
from .rrg import RrgEngine
from .sizing import calculate_size

#: RRG quadrants that permit opening a long option position.
ENTRY_QUADRANTS = {Quadrant.LEADING, Quadrant.IMPROVING}


def classify_protocol(levels: CoaLevels, tolerance: int | None = None) -> Protocol:
    """Derive the active protocol from COA 2.0 level migration."""
    tol = settings.level_shift_tolerance if tolerance is None else tolerance
    if levels.aegis_1 is None or levels.zenith_1 is None:
        return Protocol.DELTA

    support_solid = abs(levels.aegis_shift) <= tol
    resistance_solid = abs(levels.zenith_shift) <= tol
    resistance_up = levels.zenith_shift > tol
    support_down = levels.aegis_shift < -tol

    if support_solid and resistance_solid:
        return Protocol.ALPHA
    if support_solid and resistance_up:
        return Protocol.BETA
    if resistance_solid and support_down:
        return Protocol.GAMMA
    return Protocol.DELTA


class SignalEngine:
    """Turns a live chain snapshot into an executable (or blocked) Delta-K signal."""

    def __init__(self, underlying: str, builder: ChainBuilder, rrg: RrgEngine) -> None:
        self.underlying = underlying
        self.builder = builder
        self.rrg = rrg
        self._last_spot: float = 0.0

    # ------------------------------------------------------------------ #
    def _blocked(
        self,
        protocol: Protocol,
        levels: CoaLevels,
        reason: str,
        headline: str,
        rationale: list[str],
    ) -> Signal:
        return Signal(
            underlying=self.underlying,
            protocol=protocol,
            headline=headline,
            rationale=rationale,
            actionable=False,
            blocked_reason=reason,
            levels=levels,
            generated_at=datetime.now().isoformat(timespec="seconds"),
        )

    def _row_for(self, chain: OptionChain, strike: float) -> ChainRow | None:
        for row in chain.rows:
            if abs(row.strike - strike) < 1e-6:
                return row
        return None

    # ------------------------------------------------------------------ #
    def evaluate(
        self,
        chain: OptionChain,
        master: ScripMaster,
        capital: float,
        risk_pct: float | None = None,
        max_deployable: float | None = None,
    ) -> Signal:
        """Produce the current signal for this underlying."""
        levels = chain.levels
        spot = chain.spot
        prev_spot, self._last_spot = self._last_spot, spot
        protocol = classify_protocol(levels)

        rationale = [
            f"COA 1.0 walls — Aegis-0 {levels.aegis_0 or '—'} / Zenith-0 {levels.zenith_0 or '—'}",
            f"COA 2.0 live — Aegis-1 {levels.aegis_1 or '—'} (shift {levels.aegis_shift:+d}) "
            f"/ Zenith-1 {levels.zenith_1 or '—'} (shift {levels.zenith_shift:+d})",
            f"PCR {chain.pcr:.2f} · spot {spot:,.2f} · ATM {chain.atm_strike:,.0f}",
        ]

        if spot <= 0 or not chain.rows:
            return self._blocked(
                protocol, levels, "NO_DATA", "Awaiting live feed", rationale
            )

        if protocol is Protocol.DELTA:
            return self._blocked(
                protocol,
                levels,
                "VOLATILITY_TRAP",
                "Protocol Delta — auto-driver muted",
                rationale
                + ["Both bounds are migrating: consolidation / volatility trap."],
            )

        # -- directional intent ------------------------------------------ #
        option_type: OptionType | None = None
        trigger = ""

        if protocol is Protocol.ALPHA:
            band = settings.invalidation_pct / 100.0
            near_support = (
                levels.aegis_1 is not None
                and abs(spot - levels.aegis_1) <= levels.aegis_1 * band
            )
            near_resistance = (
                levels.zenith_1 is not None
                and abs(spot - levels.zenith_1) <= levels.zenith_1 * band
            )
            if near_support and not near_resistance:
                option_type = OptionType.CE
                trigger = f"Spot at Aegis-1 {levels.aegis_1:,.0f} — equilibrium bounce long."
            elif near_resistance and not near_support:
                option_type = OptionType.PE
                trigger = f"Spot at Zenith-1 {levels.zenith_1:,.0f} — equilibrium fade short."
            else:
                return self._blocked(
                    protocol,
                    levels,
                    "MID_RANGE",
                    "Protocol Alpha — waiting for a bound",
                    rationale
                    + ["Spot is mid-range; Alpha only engages at Aegis-1 or Zenith-1."],
                )

        elif protocol is Protocol.BETA:
            option_type = OptionType.CE
            dipping = prev_spot > 0 and spot <= prev_spot
            trigger = (
                "Protocol Beta ascension — buying the micro-dip in ITM calls."
                if dipping
                else "Protocol Beta ascension — call bias armed, awaiting micro-dip."
            )
            if not dipping:
                return self._blocked(
                    protocol,
                    levels,
                    "AWAIT_DIP",
                    "Protocol Beta — awaiting downward micro-dip",
                    rationale + [trigger, "Put purchases are banned under Beta."],
                )

        elif protocol is Protocol.GAMMA:
            option_type = OptionType.PE
            trigger = "Protocol Gamma cascade — support migrating down, ITM puts armed."

        assert option_type is not None

        # -- Zero-OTM strike selection ------------------------------------ #
        candidate = None
        chosen_depth = 0
        for depth in range(settings.min_itm_depth, settings.max_itm_depth + 1):
            inst = self.builder.select_itm(master, option_type, spot, depth)
            if inst is None:
                continue
            row = self._row_for(chain, inst.strike)
            leg = (row.call if option_type is OptionType.CE else row.put) if row else None
            if leg is None or leg.ltp <= 0:
                continue
            if leg.moneyness.value != "ITM":
                continue  # Zero-OTM rule: never long an ATM/OTM contract.
            if leg.quadrant is Quadrant.LAGGING:
                continue  # high decay node
            candidate = (inst, leg, depth)
            chosen_depth = depth
            break

        if candidate is None:
            return self._blocked(
                protocol,
                levels,
                "NO_VALID_ITM",
                "No compliant ITM node",
                rationale
                + [
                    trigger,
                    "Zero-OTM rule: 2nd/3rd ITM strikes are unpriced or sitting in the "
                    "Lagging quadrant (high decay).",
                ],
            )

        inst, leg, _ = candidate
        quadrant = leg.quadrant

        # -- risk geometry ------------------------------------------------ #
        entry = leg.best_ask if leg.best_ask > 0 else leg.ltp
        stop_points = round(entry * settings.default_stop_pct, 2)
        stop = round(max(0.05, entry - stop_points), 2)
        target_1 = round(entry + stop_points * 1.5, 2)
        target_2 = round(entry + stop_points * 3.0, 2)

        sizing: SizingResult = calculate_size(
            self.underlying,
            stop_loss_points=stop_points,
            capital=capital,
            risk_pct=risk_pct,
            lot_size=inst.lot_size or None,
            entry_price=entry,
            max_deployable=max_deployable,
        )

        rationale.append(trigger)
        rationale.append(
            f"Zero-OTM compliant: {chosen_depth}nd/rd ITM {option_type.value} "
            f"@ {inst.strike:,.0f} (depth {leg.itm_depth})"
        )
        if quadrant is not None:
            rationale.append(
                f"RRG node {quadrant.value} — RS-Ratio {leg.rs_ratio:.2f} / "
                f"RS-Momentum {leg.rs_momentum:.2f}"
            )

        actionable = sizing.lots > 0 and (quadrant is None or quadrant in ENTRY_QUADRANTS)
        blocked_reason = None
        if sizing.lots == 0:
            blocked_reason = sizing.capped_by or "ZERO_LOTS"
            rationale.append("Sizing resolved to zero lots — entry suppressed.")
        elif quadrant is Quadrant.WEAKENING:
            actionable = False
            blocked_reason = "WEAKENING_NODE"
            rationale.append(
                "Weakening quadrant: momentum fading — scaling out of open exposure "
                "rather than adding."
            )
        elif quadrant is Quadrant.LAGGING:
            actionable = False
            blocked_reason = "LAGGING_NODE"

        headline = (
            f"Protocol {protocol.value.title()} · BUY {inst.symbol}"
            if actionable
            else f"Protocol {protocol.value.title()} · standby"
        )

        return Signal(
            underlying=self.underlying,
            protocol=protocol,
            headline=headline,
            rationale=rationale,
            actionable=actionable,
            blocked_reason=blocked_reason,
            token=inst.token,
            trading_symbol=inst.symbol,
            option_type=option_type,
            strike=inst.strike,
            itm_depth=leg.itm_depth,
            entry_price=round(entry, 2),
            stop_loss=stop,
            stop_loss_points=stop_points,
            target_1=target_1,
            target_2=target_2,
            quadrant=quadrant,
            sizing=sizing,
            levels=levels,
            generated_at=datetime.now().isoformat(timespec="seconds"),
        )
