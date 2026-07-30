from __future__ import annotations

from app.engine.coa import ChainBuilder
from app.engine.dkms import SignalEngine, classify_protocol
from app.engine.rrg import RrgEngine
from app.schemas import CoaLevels, OptionType, Protocol
from app.ws_manager import TickStore

from .conftest import fill_ticks, make_master


def levels(aegis=24_300.0, zenith=24_800.0, a_shift=0, z_shift=0) -> CoaLevels:
    return CoaLevels(
        aegis_0=aegis,
        zenith_0=zenith,
        aegis_1=aegis,
        zenith_1=zenith,
        aegis_shift=a_shift,
        zenith_shift=z_shift,
    )


# --------------------------------------------------------------------------- #
# regime classification
# --------------------------------------------------------------------------- #
def test_protocol_alpha_on_stable_bounds():
    assert classify_protocol(levels()) is Protocol.ALPHA


def test_protocol_beta_when_resistance_migrates_up():
    assert classify_protocol(levels(z_shift=3)) is Protocol.BETA


def test_protocol_gamma_when_support_migrates_down():
    assert classify_protocol(levels(a_shift=-3)) is Protocol.GAMMA


def test_protocol_delta_when_both_migrate():
    assert classify_protocol(levels(a_shift=-3, z_shift=3)) is Protocol.DELTA


def test_protocol_delta_without_levels():
    assert classify_protocol(CoaLevels()) is Protocol.DELTA


# --------------------------------------------------------------------------- #
# signal generation
# --------------------------------------------------------------------------- #
def _engine(spot: float, oi_profile=None):
    master = make_master()
    ticks = fill_ticks(master, TickStore(), spot=spot, oi_profile=oi_profile)
    rrg = RrgEngine()
    builder = ChainBuilder("NIFTY", rrg)
    # Warm the RRG so nodes are not damped to the origin.
    for _ in range(12):
        builder.build(master, ticks, spot=spot)
    return master, ticks, builder, SignalEngine("NIFTY", builder, rrg)


def test_alpha_at_support_buys_an_itm_call():
    profile = {(24_300.0, "PE"): 900_000, (24_800.0, "CE"): 850_000}
    master, ticks, builder, engine = _engine(24_300.0, profile)
    chain = builder.build(master, ticks, spot=24_300.0)
    sig = engine.evaluate(chain, master, capital=1_000_000)

    assert sig.protocol is Protocol.ALPHA
    assert sig.option_type is OptionType.CE
    assert sig.itm_depth in (2, 3)
    assert sig.strike < chain.spot  # a call ITM strike sits below spot
    assert sig.sizing is not None and sig.sizing.lots >= 1


def test_alpha_mid_range_is_blocked():
    profile = {(24_300.0, "PE"): 900_000, (24_800.0, "CE"): 850_000}
    master, ticks, builder, engine = _engine(24_550.0, profile)
    chain = builder.build(master, ticks, spot=24_550.0)
    sig = engine.evaluate(chain, master, capital=1_000_000)
    assert sig.actionable is False
    assert sig.blocked_reason == "MID_RANGE"


def test_delta_regime_mutes_the_auto_driver():
    master, ticks, builder, engine = _engine(24_500.0)
    chain = builder.build(master, ticks, spot=24_500.0)
    chain.levels.aegis_shift = -4
    chain.levels.zenith_shift = 4
    sig = engine.evaluate(chain, master, capital=1_000_000)
    assert sig.protocol is Protocol.DELTA
    assert sig.blocked_reason == "VOLATILITY_TRAP"
    assert sig.actionable is False


def test_gamma_regime_selects_an_itm_put():
    master, ticks, builder, engine = _engine(24_500.0)
    chain = builder.build(master, ticks, spot=24_500.0)
    chain.levels.aegis_shift = -3
    chain.levels.zenith_shift = 0
    sig = engine.evaluate(chain, master, capital=1_000_000)
    assert sig.protocol is Protocol.GAMMA
    assert sig.option_type is OptionType.PE
    assert sig.strike > chain.spot  # put ITM strikes sit above spot


def test_zero_otm_rule_never_selects_an_otm_strike():
    profile = {(24_300.0, "PE"): 900_000, (24_800.0, "CE"): 850_000}
    master, ticks, builder, engine = _engine(24_300.0, profile)
    chain = builder.build(master, ticks, spot=24_300.0)
    sig = engine.evaluate(chain, master, capital=1_000_000)
    assert sig.itm_depth is not None and sig.itm_depth >= 2


def test_signal_geometry_is_internally_consistent():
    profile = {(24_300.0, "PE"): 900_000, (24_800.0, "CE"): 850_000}
    master, ticks, builder, engine = _engine(24_300.0, profile)
    chain = builder.build(master, ticks, spot=24_300.0)
    sig = engine.evaluate(chain, master, capital=1_000_000)
    assert sig.stop_loss < sig.entry_price < sig.target_1 < sig.target_2
    assert round(sig.entry_price - sig.stop_loss, 2) == sig.stop_loss_points


def test_no_capital_means_no_actionable_signal():
    profile = {(24_300.0, "PE"): 900_000, (24_800.0, "CE"): 850_000}
    master, ticks, builder, engine = _engine(24_300.0, profile)
    chain = builder.build(master, ticks, spot=24_300.0)
    sig = engine.evaluate(chain, master, capital=1_000.0)
    assert sig.actionable is False
    assert sig.sizing.lots == 0
