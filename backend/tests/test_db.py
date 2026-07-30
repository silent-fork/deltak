"""Repository tests against a mocked PostgREST transport.

The sandbox cannot reach Supabase, and the service-role key never belongs in a
test fixture, so these exercise the write-behind machinery — payload shape,
batching, session stamping, back-pressure and failure isolation — against an
in-process httpx transport.
"""

from __future__ import annotations

import asyncio

import httpx
import pytest

from app.db import SupabaseRepository
from app.schemas import (
    CoaLevels,
    ExecutionMode,
    OptionType,
    OrderRequest,
    OrderResult,
    Position,
    Protocol,
    Quadrant,
    RiskEvent,
    Side,
    Signal,
    SizingResult,
)


class Recorder:
    """Captures every PostgREST call the repository makes."""

    def __init__(self, fail_tables: set[str] | None = None) -> None:
        self.calls: list[tuple[str, list[dict], dict]] = []
        self.fail_tables = fail_tables or set()

    def transport(self) -> httpx.MockTransport:
        def handler(request: httpx.Request) -> httpx.Response:
            table = request.url.path.rsplit("/", 1)[-1]
            if request.method == "GET":
                return httpx.Response(200, json=[{"table": table}])
            import json

            rows = json.loads(request.content.decode())
            self.calls.append((table, rows, dict(request.headers)))
            if table in self.fail_tables:
                return httpx.Response(400, text="simulated failure")
            if table == "trading_sessions":
                return httpx.Response(
                    201, json=[{"id": "11111111-2222-3333-4444-555555555555"}]
                )
            return httpx.Response(201, json=[])

        return httpx.MockTransport(handler)

    def rows_for(self, table: str) -> list[dict]:
        return [r for t, rows, _ in self.calls if t == table for r in rows]


async def make_repo(recorder: Recorder) -> SupabaseRepository:
    repo = SupabaseRepository()
    repo.url = "https://project.supabase.co"
    repo.key = "service-role-test-key"
    repo.enabled = True
    repo._client = httpx.AsyncClient(transport=recorder.transport())
    await repo.start(ExecutionMode.PAPER, 500_000.0, "1.0.0")
    return repo


async def drain(repo: SupabaseRepository) -> None:
    assert repo._queue is not None
    await asyncio.wait_for(repo._queue.join(), timeout=2.0)


def make_position(**overrides) -> Position:
    base = dict(
        id="DK-101010-001",
        underlying="NIFTY",
        token="35005",
        trading_symbol="NIFTY24500CE",
        option_type=OptionType.CE,
        strike=24_500.0,
        side=Side.BUY,
        quantity=150,
        lots=2,
        lot_size=75,
        avg_price=180.0,
        ltp=190.0,
        stop_loss=135.0,
        protocol=Protocol.ALPHA,
        opened_at="2026-07-30T10:00:00",
        mode=ExecutionMode.PAPER,
    )
    base.update(overrides)
    return Position(**base)


# --------------------------------------------------------------------------- #
@pytest.mark.asyncio
async def test_disabled_repository_is_a_noop():
    repo = SupabaseRepository()
    repo.enabled = False
    repo.record_event(RiskEvent(ts="t", kind="INFO", underlying=None, message="x"))
    repo.record_position(make_position())
    assert repo.status()["enabled"] is False
    assert repo.writes_ok == 0


@pytest.mark.asyncio
async def test_session_is_opened_and_stamped_onto_rows():
    rec = Recorder()
    repo = await make_repo(rec)
    try:
        assert repo.session_id == "11111111-2222-3333-4444-555555555555"
        repo.record_event(
            RiskEvent(ts="2026-07-30T10:00:00", kind="PANIC", underlying="NIFTY", message="flat")
        )
        await drain(repo)
        row = rec.rows_for("risk_events")[0]
        assert row["session_id"] == repo.session_id
        assert row["kind"] == "PANIC"
        assert row["message"] == "flat"
    finally:
        await repo.stop()


@pytest.mark.asyncio
async def test_position_upsert_carries_conflict_target():
    rec = Recorder()
    repo = await make_repo(rec)
    try:
        repo.record_position(make_position())
        await drain(repo)
        row = rec.rows_for("positions")[0]
        assert row["ledger_id"] == "DK-101010-001"
        assert row["option_type"] == "CE"
        assert row["side"] == "BUY"
        assert row["status"] == "OPEN"
        # merge-duplicates is what makes repeated marks idempotent
        headers = [h for t, _, h in rec.calls if t == "positions"][0]
        assert "merge-duplicates" in headers["prefer"]
    finally:
        await repo.stop()


@pytest.mark.asyncio
async def test_order_records_rejection_status():
    rec = Recorder()
    repo = await make_repo(rec)
    try:
        req = OrderRequest(
            underlying="NIFTY",
            token="35005",
            trading_symbol="NIFTY24500CE",
            lots=2,
            lot_size=75,
            option_type=OptionType.CE,
            strike=24_500.0,
            protocol=Protocol.ALPHA,
        )
        repo.record_order(
            req,
            OrderResult(ok=False, mode=ExecutionMode.LIVE, message="rejected", quantity=150),
        )
        await drain(repo)
        row = rec.rows_for("orders")[0]
        assert row["status"] == "REJECTED"
        assert row["mode"] == "live"
        assert row["quantity"] == 150
    finally:
        await repo.stop()


@pytest.mark.asyncio
async def test_signal_row_flattens_levels_and_sizing():
    rec = Recorder()
    repo = await make_repo(rec)
    try:
        signal = Signal(
            underlying="BANKNIFTY",
            protocol=Protocol.BETA,
            headline="x",
            actionable=True,
            option_type=OptionType.CE,
            strike=51_800.0,
            itm_depth=2,
            entry_price=420.5,
            stop_loss=315.0,
            target_1=577.0,
            quadrant=Quadrant.LEADING,
            sizing=SizingResult(
                lots=3,
                quantity=45,
                lot_size=15,
                risk_amount=5000,
                risk_per_lot=1575,
                capital=500000,
                risk_pct=1.0,
            ),
            levels=CoaLevels(aegis_1=51_500.0, zenith_1=52_200.0),
        )
        repo.record_signal(signal, spot=51_900.0, pcr=1.12)
        await drain(repo)
        row = rec.rows_for("signals")[0]
        assert row["protocol"] == "BETA"
        assert row["actionable"] is True
        assert row["lots"] == 3
        assert row["aegis_1"] == 51_500.0
        assert row["zenith_1"] == 52_200.0
        assert row["spot"] == 51_900.0
    finally:
        await repo.stop()


@pytest.mark.asyncio
async def test_writes_are_batched_per_table():
    rec = Recorder()
    repo = await make_repo(rec)
    try:
        for i in range(8):
            repo.record_event(
                RiskEvent(ts=f"t{i}", kind="INFO", underlying=None, message=f"e{i}")
            )
        await drain(repo)
        event_calls = [c for c in rec.calls if c[0] == "risk_events"]
        # Eight rows must not cost eight round trips.
        assert len(event_calls) < 8
        assert len(rec.rows_for("risk_events")) == 8
    finally:
        await repo.stop()


@pytest.mark.asyncio
async def test_write_failures_are_counted_not_raised():
    rec = Recorder(fail_tables={"risk_events"})
    repo = await make_repo(rec)
    try:
        repo.record_event(RiskEvent(ts="t", kind="INFO", underlying=None, message="boom"))
        await drain(repo)
        assert repo.writes_failed >= 1
        assert repo.last_error is not None
        # The worker survives to serve the next write.
        repo.record_position(make_position())
        await drain(repo)
        assert repo.writes_ok >= 1
    finally:
        await repo.stop()


@pytest.mark.asyncio
async def test_queue_backpressure_drops_oldest_instead_of_blocking():
    rec = Recorder()
    repo = SupabaseRepository()
    repo.url = "https://project.supabase.co"
    repo.key = "k"
    repo.enabled = True
    repo.session_id = "s"
    repo._queue = asyncio.Queue(maxsize=2)  # no worker draining it

    for i in range(6):
        repo.record_event(
            RiskEvent(ts=f"t{i}", kind="INFO", underlying=None, message=f"e{i}")
        )

    assert repo._queue.qsize() == 2
    assert repo.dropped == 4  # never blocked the caller


@pytest.mark.asyncio
async def test_read_query_hits_postgrest():
    rec = Recorder()
    repo = await make_repo(rec)
    try:
        rows = await repo.query("positions", {"select": "*"})
        assert rows == [{"table": "positions"}]
    finally:
        await repo.stop()
