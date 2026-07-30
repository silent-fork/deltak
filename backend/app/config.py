"""Delta-K Terminal — runtime configuration.

Every knob of the Delta-K Matrix Strategy (DKMS) is surfaced here so the engine
can be re-tuned without touching strategy code.  Values are read from the
environment (``.env`` supported) with production-safe defaults.
"""

from __future__ import annotations

from datetime import time
from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict

IST = ZoneInfo("Asia/Kolkata")

# --------------------------------------------------------------------------- #
# Angel One SmartAPI v2.0 endpoints
# --------------------------------------------------------------------------- #
SCRIP_MASTER_URL = (
    "https://margincalculator.angelone.in/OpenAPI_File/files/OpenAPIScripMaster.json"
)
API_ROOT = "https://apiconnect.angelone.in"
LOGIN_URL = f"{API_ROOT}/rest/auth/angelbroking/user/v1/loginByPassword"
REFRESH_URL = f"{API_ROOT}/rest/auth/angelbroking/jwt/v1/generateTokens"
PROFILE_URL = f"{API_ROOT}/rest/secure/angelbroking/user/v1/getProfile"
RMS_URL = f"{API_ROOT}/rest/secure/angelbroking/user/v1/getRMS"
PLACE_ORDER_URL = f"{API_ROOT}/rest/secure/angelbroking/order/v1/placeOrder"
ORDER_BOOK_URL = f"{API_ROOT}/rest/secure/angelbroking/order/v1/getOrderBook"
POSITION_URL = f"{API_ROOT}/rest/secure/angelbroking/order/v1/getPosition"
LTP_URL = f"{API_ROOT}/rest/secure/angelbroking/order/v1/getLtpData"
SMART_STREAM_URL = "wss://smartapisocket.angelone.in/smart-stream"

# --------------------------------------------------------------------------- #
# Index universe
# --------------------------------------------------------------------------- #
#: Underlying name -> spot instrument descriptor.  ``token`` is resolved from the
#: scrip master at bootstrap; the fallback tokens are the well-known NSE_CM
#: index tokens and are only used when the master fetch is unavailable.
INDEX_UNIVERSE: dict[str, dict] = {
    "NIFTY": {
        "label": "NIFTY 50",
        "spot_symbol": "NIFTY",
        "spot_token_fallback": "99926000",
        "strike_step": 50,
        "lot_size": 75,
        "lot_increments": [25, 50, 75],
    },
    "BANKNIFTY": {
        "label": "BANK NIFTY",
        "spot_symbol": "BANKNIFTY",
        "spot_token_fallback": "99926009",
        "strike_step": 100,
        "lot_size": 15,
        "lot_increments": [15, 30],
    },
    "FINNIFTY": {
        "label": "FIN NIFTY",
        "spot_symbol": "FINNIFTY",
        "spot_token_fallback": "99926037",
        "strike_step": 50,
        "lot_size": 40,
        "lot_increments": [25, 40],
    },
}

#: SmartStream exchange type codes.
EXCHANGE_NSE_CM = 1
EXCHANGE_NSE_FO = 2


class Settings(BaseSettings):
    """Environment-driven settings for the Delta-K execution engine."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"), env_prefix="DK_", extra="ignore"
    )

    # -- server ------------------------------------------------------------ #
    host: str = "0.0.0.0"
    port: int = 8000
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # -- Angel One credentials (optional: the UI can supply them at runtime) - #
    api_key: str = ""
    client_code: str = ""
    client_pin: str = ""

    # Angel One expects these client identity headers on every request.
    client_local_ip: str = "127.0.0.1"
    client_public_ip: str = "127.0.0.1"
    mac_address: str = "00:00:00:00:00:00"

    # -- execution --------------------------------------------------------- #
    #: ``paper`` (default, virtual ledger) or ``live`` (routes to NSE).
    execution_mode: str = "paper"
    paper_capital: float = 500_000.0
    #: One-way slippage applied to simulated fills, in fraction of LTP.
    paper_slippage_pct: float = 0.0015
    #: Flat per-order cost (brokerage + statutory) applied to paper fills, INR.
    paper_cost_per_order: float = 25.0
    product_type: str = "INTRADAY"

    # -- risk -------------------------------------------------------------- #
    risk_pct_per_trade: float = 1.0
    #: Stop distance as a fraction of option premium when none is supplied.
    default_stop_pct: float = 0.25
    max_concurrent_positions: int = 4
    #: Index break invalidation threshold (0.35 %) around Aegis-1 / Zenith-1.
    invalidation_pct: float = 0.35

    # -- DKMS / COA -------------------------------------------------------- #
    #: Strikes either side of ATM retained in the 4-quadrant matrix.
    chain_depth: int = 12
    #: ITM depth allowed for long entries — the Zero-OTM rule.
    min_itm_depth: int = 2
    max_itm_depth: int = 3
    #: Rolling window (ticks) for the RRG normalisation.
    rrg_window: int = 40
    #: Momentum lookback (ticks) inside the RRG engine.
    rrg_momentum_lookback: int = 5
    #: Number of historical RRG points retained per node for the trailing tail.
    rrg_tail_length: int = 12
    #: Strikes either side of ATM plotted as active nodes on the RRG scatter.
    rrg_node_span: int = 6
    #: Strike-level shift (in strike steps) that counts as a level "moving".
    level_shift_tolerance: int = 1

    # -- schedule ---------------------------------------------------------- #
    market_open: time = time(9, 15)
    market_close: time = time(15, 30)
    #: 3:15 PM IST Daylight Rest Protocol.
    daylight_rest: time = time(15, 15)
    risk_loop_interval: float = 1.0
    stream_interval: float = 1.0

    # -- persistence (Supabase) -------------------------------------------- #
    #: e.g. https://<project-ref>.supabase.co — leave blank to disable the DB.
    supabase_url: str = ""
    #: Service-role key. Server-side only; it bypasses RLS, so never ship it to
    #: the browser. The engine is the sole writer of the ledger schema.
    supabase_service_key: str = ""
    #: Seconds between low-frequency syncs of open-position marks.
    db_position_sync_interval: float = 30.0

    # -- development ------------------------------------------------------- #
    #: When true and no SmartAPI session exists, drive the HUD from a local
    #: synthetic tick generator.  The UI labels this feed as SIMULATED.
    simulate: bool = False

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
