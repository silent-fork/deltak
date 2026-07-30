"""Pydantic contracts shared between the FastAPI engine and the Next.js HUD."""

from __future__ import annotations

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


# --------------------------------------------------------------------------- #
# Enumerations
# --------------------------------------------------------------------------- #
class ExecutionMode(str, Enum):
    PAPER = "paper"
    LIVE = "live"


class OptionType(str, Enum):
    CE = "CE"
    PE = "PE"


class Side(str, Enum):
    BUY = "BUY"
    SELL = "SELL"


class Quadrant(str, Enum):
    LEADING = "LEADING"
    IMPROVING = "IMPROVING"
    WEAKENING = "WEAKENING"
    LAGGING = "LAGGING"


class Protocol(str, Enum):
    ALPHA = "ALPHA"  # Equilibrium range
    BETA = "BETA"  # Ascension vector
    GAMMA = "GAMMA"  # Cascade vector
    DELTA = "DELTA"  # Volatility trap — auto-driver muted


class Moneyness(str, Enum):
    ITM = "ITM"
    ATM = "ATM"
    OTM = "OTM"


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #
class LoginRequest(BaseModel):
    """Credentials the user supplies at login.

    The SmartAPI key is deliberately **not** part of this payload. It is a
    long-lived secret tied to the deployment (and to the IP allowlist), so it
    lives only in the server's environment — never in the browser, never on the
    wire, never in a request log.
    """

    client_code: str = Field(..., min_length=3)
    pin: str = Field(..., min_length=4)
    #: The six-digit code currently displayed on the user's authenticator app.
    #: Angel One does not accept a stored secret here — the code is transient and
    #: is never persisted by the engine.
    totp: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    #: Optional passthrough: SmartAPI echoes ``state`` back in the login response.
    state: str | None = None


class SessionStatus(BaseModel):
    authenticated: bool
    client_code: str | None = None
    feed_connected: bool = False
    mode: ExecutionMode
    login_time: str | None = None
    state: str | None = None
    message: str | None = None


class RmsBalance(BaseModel):
    net: float = 0.0
    available_cash: float = 0.0
    utilised_debits: float = 0.0
    source: Literal["live", "paper"] = "paper"


# --------------------------------------------------------------------------- #
# Market data
# --------------------------------------------------------------------------- #
class Tick(BaseModel):
    token: str
    ltp: float = 0.0
    volume: int = 0
    oi: int = 0
    oi_change_pct: float = 0.0
    best_bid: float = 0.0
    best_ask: float = 0.0
    open: float = 0.0
    high: float = 0.0
    low: float = 0.0
    close: float = 0.0
    exchange_ts: int = 0


class RrgPoint(BaseModel):
    rs_ratio: float
    rs_momentum: float


class RrgNode(BaseModel):
    token: str
    label: str
    strike: float
    option_type: OptionType
    rs_ratio: float
    rs_momentum: float
    quadrant: Quadrant
    tail: list[RrgPoint] = Field(default_factory=list)


class OptionLeg(BaseModel):
    token: str
    trading_symbol: str
    ltp: float = 0.0
    change_pct: float = 0.0
    volume: int = 0
    oi: int = 0
    #: COA 2.0 — intraday change in open interest (contracts).
    oi_change: int = 0
    oi_change_pct: float = 0.0
    best_bid: float = 0.0
    best_ask: float = 0.0
    moneyness: Moneyness = Moneyness.OTM
    itm_depth: int = 0
    quadrant: Quadrant | None = None
    rs_ratio: float | None = None
    rs_momentum: float | None = None


class ChainRow(BaseModel):
    strike: float
    call: OptionLeg | None = None
    put: OptionLeg | None = None
    is_atm: bool = False
    #: True on the strike immediately below the Quantum Horizon separator.
    quantum_horizon: bool = False


class CoaLevels(BaseModel):
    """Chart of Accuracy support / resistance bounds."""

    #: COA 1.0 — cumulative open-interest walls.
    aegis_0: float | None = None
    zenith_0: float | None = None
    #: COA 2.0 — intraday OI-change driven, the levels the engine actually trades.
    aegis_1: float | None = None
    zenith_1: float | None = None
    aegis_shift: int = 0
    zenith_shift: int = 0


class OptionChain(BaseModel):
    underlying: str
    label: str
    spot: float = 0.0
    spot_change_pct: float = 0.0
    atm_strike: float = 0.0
    expiry: str | None = None
    rows: list[ChainRow] = Field(default_factory=list)
    levels: CoaLevels = Field(default_factory=CoaLevels)
    pcr: float = 0.0
    updated_at: str | None = None


# --------------------------------------------------------------------------- #
# Signal engine
# --------------------------------------------------------------------------- #
class SizingRequest(BaseModel):
    underlying: str
    capital: float | None = None
    risk_pct: float | None = None
    stop_loss_points: float
    lot_size: int | None = None
    entry_price: float | None = None


class SizingResult(BaseModel):
    lots: int
    quantity: int
    lot_size: int
    risk_amount: float
    risk_per_lot: float
    entry_cost: float = 0.0
    capital: float
    risk_pct: float
    capped_by: str | None = None


class Signal(BaseModel):
    underlying: str
    protocol: Protocol
    headline: str
    rationale: list[str] = Field(default_factory=list)
    actionable: bool = False
    blocked_reason: str | None = None

    token: str | None = None
    trading_symbol: str | None = None
    option_type: OptionType | None = None
    strike: float | None = None
    itm_depth: int | None = None
    entry_price: float | None = None
    stop_loss: float | None = None
    stop_loss_points: float | None = None
    target_1: float | None = None
    target_2: float | None = None
    quadrant: Quadrant | None = None

    sizing: SizingResult | None = None
    levels: CoaLevels = Field(default_factory=CoaLevels)
    generated_at: str | None = None


# --------------------------------------------------------------------------- #
# Execution / ledger
# --------------------------------------------------------------------------- #
class OrderRequest(BaseModel):
    underlying: str
    token: str
    trading_symbol: str
    transaction_type: Side = Side.BUY
    quantity: int | None = None
    lots: int | None = None
    lot_size: int | None = None
    order_type: Literal["MARKET", "LIMIT"] = "MARKET"
    price: float = 0.0
    stop_loss: float | None = None
    target: float | None = None
    protocol: Protocol | None = None
    option_type: OptionType | None = None
    strike: float | None = None
    #: Overrides the server default for this single order.
    mode: ExecutionMode | None = None


class OrderResult(BaseModel):
    ok: bool
    mode: ExecutionMode
    order_id: str | None = None
    message: str
    fill_price: float | None = None
    quantity: int | None = None
    position_id: str | None = None
    raw: dict | None = None


class Position(BaseModel):
    id: str
    underlying: str
    token: str
    trading_symbol: str
    option_type: OptionType | None = None
    strike: float | None = None
    side: Side = Side.BUY
    quantity: int
    lots: int
    lot_size: int
    avg_price: float
    ltp: float = 0.0
    stop_loss: float | None = None
    target: float | None = None
    unrealised_pnl: float = 0.0
    realised_pnl: float = 0.0
    pnl_pct: float = 0.0
    protocol: Protocol | None = None
    opened_at: str
    closed_at: str | None = None
    exit_price: float | None = None
    exit_reason: str | None = None
    status: Literal["OPEN", "CLOSED"] = "OPEN"
    mode: ExecutionMode = ExecutionMode.PAPER


class LedgerSnapshot(BaseModel):
    mode: ExecutionMode
    capital: float
    equity: float
    open_positions: list[Position] = Field(default_factory=list)
    closed_positions: list[Position] = Field(default_factory=list)
    open_pnl: float = 0.0
    realised_pnl: float = 0.0
    total_pnl: float = 0.0
    deployed_margin: float = 0.0
    charges: float = 0.0


class RiskEvent(BaseModel):
    ts: str
    kind: Literal[
        "INVALIDATION", "DAYLIGHT_REST", "STOP_LOSS", "TARGET", "PANIC", "INFO"
    ]
    underlying: str | None = None
    message: str


class EngineSnapshot(BaseModel):
    """The single payload pushed to the HUD on every stream frame."""

    ts: str
    mode: ExecutionMode
    authenticated: bool
    feed_connected: bool
    market_open: bool
    seconds_to_daylight_rest: int
    spots: dict[str, dict]
    chains: dict[str, OptionChain]
    rrg: dict[str, list[RrgNode]]
    signals: dict[str, Signal]
    ledger: LedgerSnapshot
    events: list[RiskEvent] = Field(default_factory=list)
