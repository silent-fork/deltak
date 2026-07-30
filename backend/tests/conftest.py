from __future__ import annotations

import sys
from datetime import date, timedelta
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.scrip_master import Instrument, ScripMaster  # noqa: E402
from app.schemas import Tick  # noqa: E402
from app.ws_manager import TickStore  # noqa: E402

EXPIRY = date.today() + timedelta(days=7)


def make_master(
    underlying: str = "NIFTY",
    spot: float = 24_500.0,
    step: float = 50.0,
    depth: int = 20,
    lot_size: int = 75,
) -> ScripMaster:
    """A minimal in-memory scrip master around ``spot``."""
    master = ScripMaster()
    master.options = {underlying: {EXPIRY: []}}
    token = 1000
    base = round(spot / step) * step
    for i in range(-depth, depth + 1):
        strike = base + i * step
        for opt in ("CE", "PE"):
            token += 1
            inst = Instrument(
                token=str(token),
                symbol=f"{underlying}{EXPIRY:%d%b%y}".upper() + f"{int(strike)}{opt}",
                name=underlying,
                exch_seg="NFO",
                instrument_type="OPTIDX",
                strike=strike,
                lot_size=lot_size,
                expiry=EXPIRY,
                option_type=opt,
            )
            master.options[underlying][EXPIRY].append(inst)
            master.by_token[inst.token] = inst

    spot_inst = Instrument(
        token="99926000",
        symbol=underlying,
        name=underlying,
        exch_seg="NSE",
        instrument_type="INDEX",
        lot_size=1,
    )
    master.spots[underlying] = spot_inst
    master.by_token[spot_inst.token] = spot_inst
    return master


def fill_ticks(
    master: ScripMaster,
    store: TickStore,
    underlying: str = "NIFTY",
    spot: float = 24_500.0,
    oi_profile: dict[tuple[float, str], int] | None = None,
) -> TickStore:
    """Price every contract with intrinsic + flat time value and seed OI."""
    store.apply(Tick(token=master.spots[underlying].token, ltp=spot, close=spot))
    for inst in master.contracts(underlying):
        intrinsic = (
            max(0.0, spot - inst.strike)
            if inst.option_type == "CE"
            else max(0.0, inst.strike - spot)
        )
        px = round(intrinsic + 60.0, 2)
        oi = (oi_profile or {}).get((inst.strike, inst.option_type or ""), 10_000)
        store.apply(
            Tick(
                token=inst.token,
                ltp=px,
                close=px,
                oi=oi,
                volume=1000,
                best_bid=round(px * 0.99, 2),
                best_ask=round(px * 1.01, 2),
            )
        )
    return store


@pytest.fixture()
def master() -> ScripMaster:
    return make_master()


@pytest.fixture()
def ticks(master: ScripMaster) -> TickStore:
    return fill_ticks(master, TickStore())
