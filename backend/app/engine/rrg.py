"""Relative Rotation Graph (RRG) multi-strike momentum engine.

Each option strike is treated as a "security" rotating against its index spot
("benchmark").  We use the JdK RS-Ratio / RS-Momentum construction in its
ratio-to-moving-average form:

1. ``RS_t = 100 × premium_t / spot_t`` — the raw relative-strength line.
2. ``RS-Ratio_t = 100 × RS_t / SMA(RS, window)`` — is relative strength above or
   below its own trend?
3. ``RS-Momentum_t = 100 × RS_t / RS_{t−k}`` — the rate of change of that same
   relative-strength line over the momentum lookback.

Both axes are therefore centred on 100 and scale-free, which is what makes the
quadrant test a simple comparison against 100.  Momentum is deliberately taken
on the RS line rather than on RS-Ratio: a rate of change of an *already
normalised* series saturates under a steady trend and parks genuinely trending
nodes back at the origin, and it is the raw ROC that turns first — which is what
produces the clockwise rotation the HUD draws.

Values are clipped so one illiquid print cannot fling a node off the plot, and a
bounded tail of prior points is retained per node for the HUD's momentum trace.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

from ..config import settings
from ..schemas import Quadrant, RrgPoint

#: Axis clip, in points either side of the 100 origin.
AXIS_CLIP = 12.0
#: Minimum observations before a node is considered statistically meaningful.
MIN_SAMPLES = 8


def classify_quadrant(rs_ratio: float, rs_momentum: float) -> Quadrant:
    """Map an (RS-Ratio, RS-Momentum) coordinate onto its RRG quadrant."""
    if rs_ratio >= 100.0:
        return Quadrant.LEADING if rs_momentum >= 100.0 else Quadrant.WEAKENING
    return Quadrant.IMPROVING if rs_momentum >= 100.0 else Quadrant.LAGGING


def _ratio_to_mean(series: deque[float]) -> float:
    """``100 × latest / mean(series)``, clipped to the readable axis range."""
    if not series:
        return 100.0
    mean = sum(series) / len(series)
    if abs(mean) <= 1e-12:
        return 100.0
    value = 100.0 * series[-1] / mean
    return max(100.0 - AXIS_CLIP, min(100.0 + AXIS_CLIP, value))


def _clip(value: float) -> float:
    return max(100.0 - AXIS_CLIP, min(100.0 + AXIS_CLIP, value))


@dataclass
class _NodeState:
    rs: deque[float]
    tail: deque[RrgPoint] = field(default_factory=deque)
    samples: int = 0
    last: RrgPoint | None = None


class RrgEngine:
    """Stateful, per-token RRG calculator.

    ``update`` is cheap (O(window)) and is called once per strike per stream
    frame, so the whole 4-quadrant matrix refreshes in a single pass.
    """

    def __init__(
        self,
        window: int | None = None,
        momentum_lookback: int | None = None,
        tail_length: int | None = None,
    ) -> None:
        self.window = window or settings.rrg_window
        self.momentum_lookback = momentum_lookback or settings.rrg_momentum_lookback
        self.tail_length = tail_length or settings.rrg_tail_length
        self._nodes: dict[str, _NodeState] = {}

    # ------------------------------------------------------------------ #
    def _state(self, token: str) -> _NodeState:
        state = self._nodes.get(token)
        if state is None:
            state = _NodeState(
                rs=deque(maxlen=max(self.window, self.momentum_lookback + 1)),
                tail=deque(maxlen=self.tail_length),
            )
            self._nodes[token] = state
        return state

    def update(self, token: str, price: float, benchmark: float) -> RrgPoint:
        """Feed one observation and return the node's current RRG coordinate."""
        state = self._state(token)
        if price <= 0 or benchmark <= 0:
            return state.last or RrgPoint(rs_ratio=100.0, rs_momentum=100.0)

        state.samples += 1
        state.rs.append(100.0 * price / benchmark)

        rs_ratio = _ratio_to_mean(state.rs)

        if len(state.rs) > self.momentum_lookback:
            past = state.rs[-1 - self.momentum_lookback]
            rs_momentum = (
                _clip(100.0 * state.rs[-1] / past) if abs(past) > 1e-12 else 100.0
            )
        else:
            rs_momentum = 100.0

        # Until we have a meaningful sample, pull the node toward the origin so
        # the HUD does not present noise as conviction.
        if state.samples < MIN_SAMPLES:
            damp = state.samples / MIN_SAMPLES
            rs_ratio = 100.0 + (rs_ratio - 100.0) * damp
            rs_momentum = 100.0 + (rs_momentum - 100.0) * damp

        point = RrgPoint(rs_ratio=round(rs_ratio, 4), rs_momentum=round(rs_momentum, 4))
        state.tail.append(point)
        state.last = point
        return point

    def point(self, token: str) -> RrgPoint | None:
        state = self._nodes.get(token)
        return state.last if state else None

    def quadrant(self, token: str) -> Quadrant | None:
        p = self.point(token)
        return classify_quadrant(p.rs_ratio, p.rs_momentum) if p else None

    def tail(self, token: str) -> list[RrgPoint]:
        state = self._nodes.get(token)
        return list(state.tail) if state else []

    def matured(self, token: str) -> bool:
        state = self._nodes.get(token)
        return bool(state and state.samples >= MIN_SAMPLES)

    def reset(self, token: str | None = None) -> None:
        if token is None:
            self._nodes.clear()
        else:
            self._nodes.pop(token, None)
