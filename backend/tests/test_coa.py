from __future__ import annotations

from app.engine.coa import ChainBuilder, itm_depth, nearest_strike
from app.engine.rrg import RrgEngine
from app.schemas import Moneyness, OptionType
from app.ws_manager import TickStore

from .conftest import fill_ticks, make_master


def test_itm_depth_and_nearest_strike():
    assert nearest_strike(24_512, [24_450, 24_500, 24_550]) == 24_500
    # Calls are ITM below spot, puts above.
    assert itm_depth(24_400, 24_500, "CE", 50) == 2
    assert itm_depth(24_600, 24_500, "PE", 50) == 2
    assert itm_depth(24_600, 24_500, "CE", 50) == -2
    assert itm_depth(24_500, 24_500, "CE", 50) == 0


def test_chain_shape_moneyness_and_quantum_horizon(master, ticks):
    builder = ChainBuilder("NIFTY", RrgEngine())
    chain = builder.build(master, ticks, spot=24_500.0)

    assert chain.atm_strike == 24_500.0
    assert chain.rows
    horizon = [r for r in chain.rows if r.quantum_horizon]
    assert len(horizon) == 1
    assert horizon[0].strike <= 24_500.0

    deep_call = next(r for r in chain.rows if r.strike == 24_400.0)
    assert deep_call.call.moneyness is Moneyness.ITM
    assert deep_call.call.itm_depth == 2
    assert deep_call.put.moneyness is Moneyness.OTM


def test_coa_levels_track_oi_walls():
    master = make_master()
    profile = {
        (24_300.0, "PE"): 900_000,  # put wall below spot -> Aegis
        (24_800.0, "CE"): 850_000,  # call wall above spot -> Zenith
    }
    ticks = fill_ticks(master, TickStore(), oi_profile=profile)
    builder = ChainBuilder("NIFTY", RrgEngine())
    chain = builder.build(master, ticks, spot=24_500.0)

    assert chain.levels.aegis_0 == 24_300.0
    assert chain.levels.zenith_0 == 24_800.0
    # With no intraday delta yet, COA 2.0 falls back to the COA 1.0 walls.
    assert chain.levels.aegis_1 == 24_300.0
    assert chain.levels.zenith_1 == 24_800.0


def test_coa_2_follows_intraday_oi_change():
    from app.schemas import Tick

    master = make_master()
    ticks = fill_ticks(master, TickStore())
    builder = ChainBuilder("NIFTY", RrgEngine())
    builder.build(master, ticks, spot=24_500.0)  # establishes session-open OI

    put_24350 = master.find("NIFTY", 24_350.0, "PE")
    call_24700 = master.find("NIFTY", 24_700.0, "CE")
    ticks.apply(Tick(token=put_24350.token, ltp=50.0, oi=400_000))
    ticks.apply(Tick(token=call_24700.token, ltp=50.0, oi=380_000))

    chain = builder.build(master, ticks, spot=24_500.0)
    assert chain.levels.aegis_1 == 24_350.0
    assert chain.levels.zenith_1 == 24_700.0


def test_select_itm_honours_depth_and_direction(master):
    builder = ChainBuilder("NIFTY", RrgEngine())
    call = builder.select_itm(master, OptionType.CE, 24_500.0, depth=2)
    put = builder.select_itm(master, OptionType.PE, 24_500.0, depth=3)
    assert call.strike == 24_400.0 and call.option_type == "CE"
    assert put.strike == 24_650.0 and put.option_type == "PE"


def test_pcr_is_reported(master, ticks):
    builder = ChainBuilder("NIFTY", RrgEngine())
    chain = builder.build(master, ticks, spot=24_500.0)
    assert chain.pcr > 0
