"""Supabase persistence layer.

Design constraints, in priority order:

1. **The trading loop must never wait on the database.**  Every write goes onto
   a bounded in-memory queue and is drained by a background worker.  If Supabase
   is slow, unreachable, or simply not configured, the engine keeps trading and
   the queue drops the oldest rows rather than growing without bound.
2. **No extra dependency.**  We talk to PostgREST over ``httpx``, which is
   already a dependency, instead of pulling in the (synchronous) ``supabase``
   client and its thread pool.
3. **Server-owned data.**  The engine authenticates with the service-role key,
   so RLS is enabled with no policies — anon callers get nothing.  History is
   served back to the HUD through ``/api/history/*``.

Persistence is entirely optional: with ``DK_SUPABASE_URL`` unset the repository
degrades to a no-op and every call is a cheap early return.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any, Literal

import httpx

from .config import settings
from .schemas import (
    ExecutionMode,
    OrderRequest,
    OrderResult,
    Position,
    RiskEvent,
    Signal,
)

log = logging.getLogger("deltak.db")

QUEUE_SIZE = 512
BATCH_SIZE = 25
FLUSH_INTERVAL = 2.0

Op = Literal["insert", "upsert"]


class SupabaseRepository:
    """Write-behind repository for the Delta-K ledger."""

    def __init__(self) -> None:
        self.url = settings.supabase_url.rstrip("/")
        self.key = settings.supabase_service_key
        self.session_id: str | None = None
        self.enabled = bool(self.url and self.key)
        self.writes_ok = 0
        self.writes_failed = 0
        self.dropped = 0
        self.last_error: str | None = None

        self._client: httpx.AsyncClient | None = None
        self._queue: asyncio.Queue[tuple[str, Op, dict, str | None]] | None = None
        self._worker: asyncio.Task | None = None

    # ------------------------------------------------------------------ #
    # plumbing
    # ------------------------------------------------------------------ #
    def _rest(self, table: str) -> str:
        return f"{self.url}/rest/v1/{table}"

    def _headers(self, prefer: str | None = None) -> dict[str, str]:
        headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if prefer:
            headers["Prefer"] = prefer
        return headers

    async def _http(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=8.0))
        return self._client

    # ------------------------------------------------------------------ #
    # lifecycle
    # ------------------------------------------------------------------ #
    async def start(self, mode: ExecutionMode, capital: float, version: str) -> None:
        """Open a trading session row and spin up the write-behind worker."""
        if not self.enabled:
            log.info("Supabase not configured — persistence disabled")
            return

        self._queue = asyncio.Queue(maxsize=QUEUE_SIZE)
        self._worker = asyncio.create_task(self._drain(), name="supabase-writer")

        try:
            rows = await self._write_now(
                "trading_sessions",
                "insert",
                {
                    "mode": mode.value,
                    "starting_capital": round(capital, 2),
                    "engine_version": version,
                    "started_at": datetime.now().astimezone().isoformat(),
                },
                returning=True,
            )
            if rows:
                self.session_id = rows[0].get("id")
                log.info("Supabase session opened: %s", self.session_id)
        except Exception as exc:  # noqa: BLE001 — persistence is never fatal
            self.last_error = str(exc)
            log.warning("could not open Supabase session: %s", exc)

    async def stop(self) -> None:
        if not self.enabled:
            return
        # Give the queue a moment to drain before tearing the worker down.
        if self._queue is not None:
            try:
                await asyncio.wait_for(self._queue.join(), timeout=5.0)
            except asyncio.TimeoutError:
                log.warning("Supabase queue did not drain within 5s")

        if self.session_id:
            try:
                await self._write_now(
                    "trading_sessions",
                    "upsert",
                    {
                        "id": self.session_id,
                        "ended_at": datetime.now().astimezone().isoformat(),
                    },
                )
            except Exception:  # noqa: BLE001
                pass

        if self._worker and not self._worker.done():
            self._worker.cancel()
            try:
                await self._worker
            except (asyncio.CancelledError, Exception):  # noqa: BLE001
                pass
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    # ------------------------------------------------------------------ #
    # write path
    # ------------------------------------------------------------------ #
    def _enqueue(
        self, table: str, op: Op, row: dict, on_conflict: str | None = None
    ) -> None:
        """Non-blocking enqueue. Drops the oldest row when the queue is full."""
        if not self.enabled or self._queue is None:
            return
        row = {k: v for k, v in row.items() if v is not None}
        if self.session_id:
            row.setdefault("session_id", self.session_id)
        try:
            self._queue.put_nowait((table, op, row, on_conflict))
        except asyncio.QueueFull:
            self.dropped += 1
            try:
                self._queue.get_nowait()
                self._queue.task_done()
                self._queue.put_nowait((table, op, row, on_conflict))
            except (asyncio.QueueEmpty, asyncio.QueueFull):
                pass

    async def _write_now(
        self,
        table: str,
        op: Op,
        row: dict,
        on_conflict: str | None = None,
        returning: bool = False,
    ) -> list[dict]:
        client = await self._http()
        prefer = "return=representation" if returning else "return=minimal"
        if op == "upsert":
            prefer = f"resolution=merge-duplicates,{prefer}"
        params = {"on_conflict": on_conflict} if on_conflict else None

        resp = await client.post(
            self._rest(table),
            headers=self._headers(prefer),
            params=params,
            json=[row],
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"{table} write failed ({resp.status_code}): {resp.text}")
        if not returning or not resp.content:
            return []
        payload = resp.json()
        return payload if isinstance(payload, list) else [payload]

    async def _drain(self) -> None:
        """Background worker: coalesces queued rows into batched PostgREST calls."""
        assert self._queue is not None
        while True:
            try:
                first = await self._queue.get()
                batch: dict[tuple[str, Op, str | None], list[dict]] = {}
                batch[(first[0], first[1], first[3])] = [first[2]]
                pending = [first]

                # Opportunistically pull whatever else is already queued.
                while len(pending) < BATCH_SIZE:
                    try:
                        item = self._queue.get_nowait()
                    except asyncio.QueueEmpty:
                        break
                    batch.setdefault((item[0], item[1], item[3]), []).append(item[2])
                    pending.append(item)

                for (table, op, on_conflict), rows in batch.items():
                    try:
                        await self._write_batch(table, op, rows, on_conflict)
                        self.writes_ok += len(rows)
                    except Exception as exc:  # noqa: BLE001
                        self.writes_failed += len(rows)
                        self.last_error = str(exc)
                        log.warning("supabase batch write failed: %s", exc)

                for _ in pending:
                    self._queue.task_done()

                await asyncio.sleep(0)
            except asyncio.CancelledError:
                raise
            except Exception:  # noqa: BLE001
                log.exception("supabase writer iteration failed")
                await asyncio.sleep(FLUSH_INTERVAL)

    async def _write_batch(
        self, table: str, op: Op, rows: list[dict], on_conflict: str | None
    ) -> None:
        client = await self._http()
        prefer = "return=minimal"
        if op == "upsert":
            prefer = f"resolution=merge-duplicates,{prefer}"
        params = {"on_conflict": on_conflict} if on_conflict else None
        resp = await client.post(
            self._rest(table),
            headers=self._headers(prefer),
            params=params,
            json=rows,
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"{table} ({resp.status_code}): {resp.text[:200]}")

    # ------------------------------------------------------------------ #
    # domain writes
    # ------------------------------------------------------------------ #
    def record_order(self, req: OrderRequest, result: OrderResult) -> None:
        self._enqueue(
            "orders",
            "insert",
            {
                "mode": result.mode.value,
                "underlying": req.underlying,
                "token": req.token,
                "trading_symbol": req.trading_symbol,
                "transaction_type": req.transaction_type.value,
                "order_type": req.order_type,
                "quantity": result.quantity or req.quantity,
                "lots": req.lots,
                "lot_size": req.lot_size,
                "price": req.price or None,
                "fill_price": result.fill_price,
                "status": "ACCEPTED" if result.ok else "REJECTED",
                "broker_order_id": result.order_id,
                "ledger_id": result.position_id,
                "protocol": req.protocol.value if req.protocol else None,
                "option_type": req.option_type.value if req.option_type else None,
                "strike": req.strike,
                "message": result.message,
            },
        )

    def record_position(self, pos: Position) -> None:
        """Upsert a position row; safe to call on open, scale-out and close."""
        self._enqueue(
            "positions",
            "upsert",
            {
                "ledger_id": pos.id,
                "mode": pos.mode.value,
                "underlying": pos.underlying,
                "token": pos.token,
                "trading_symbol": pos.trading_symbol,
                "option_type": pos.option_type.value if pos.option_type else None,
                "strike": pos.strike,
                "side": pos.side.value,
                "quantity": pos.quantity,
                "lots": pos.lots,
                "lot_size": pos.lot_size,
                "avg_price": pos.avg_price,
                "ltp": pos.ltp,
                "stop_loss": pos.stop_loss,
                "target": pos.target,
                "protocol": pos.protocol.value if pos.protocol else None,
                "status": pos.status,
                "unrealised_pnl": pos.unrealised_pnl,
                "realised_pnl": pos.realised_pnl,
                "exit_price": pos.exit_price,
                "exit_reason": pos.exit_reason,
                "opened_at": pos.opened_at,
                "closed_at": pos.closed_at,
                "updated_at": datetime.now().astimezone().isoformat(),
            },
            on_conflict="session_id,ledger_id",
        )

    def record_event(self, event: RiskEvent) -> None:
        self._enqueue(
            "risk_events",
            "insert",
            {
                "ts": event.ts,
                "kind": event.kind,
                "underlying": event.underlying,
                "message": event.message,
            },
        )

    def record_signal(self, signal: Signal, spot: float, pcr: float) -> None:
        self._enqueue(
            "signals",
            "insert",
            {
                "underlying": signal.underlying,
                "protocol": signal.protocol.value,
                "actionable": signal.actionable,
                "blocked_reason": signal.blocked_reason,
                "trading_symbol": signal.trading_symbol,
                "option_type": signal.option_type.value if signal.option_type else None,
                "strike": signal.strike,
                "itm_depth": signal.itm_depth,
                "entry_price": signal.entry_price,
                "stop_loss": signal.stop_loss,
                "target_1": signal.target_1,
                "quadrant": signal.quadrant.value if signal.quadrant else None,
                "lots": signal.sizing.lots if signal.sizing else None,
                "spot": round(spot, 2) or None,
                "aegis_1": signal.levels.aegis_1,
                "zenith_1": signal.levels.zenith_1,
                "pcr": round(pcr, 3) or None,
            },
        )

    def save_setting(self, key: str, value: Any) -> None:
        self._enqueue(
            "engine_settings",
            "upsert",
            {
                "key": key,
                "value": value,
                "updated_at": datetime.now().astimezone().isoformat(),
            },
            on_conflict="key",
        )

    # ------------------------------------------------------------------ #
    # reads
    # ------------------------------------------------------------------ #
    async def query(
        self, table: str, params: dict[str, str] | None = None
    ) -> list[dict]:
        """Direct PostgREST read.  Raises on failure — callers surface a 502."""
        if not self.enabled:
            return []
        client = await self._http()
        resp = await client.get(
            self._rest(table), headers=self._headers(), params=params or {}
        )
        if resp.status_code >= 400:
            raise RuntimeError(f"{table} read failed ({resp.status_code}): {resp.text[:200]}")
        payload = resp.json()
        return payload if isinstance(payload, list) else []

    def status(self) -> dict:
        return {
            "enabled": self.enabled,
            "session_id": self.session_id,
            "queued": self._queue.qsize() if self._queue else 0,
            "writes_ok": self.writes_ok,
            "writes_failed": self.writes_failed,
            "dropped": self.dropped,
            "last_error": self.last_error,
        }


DB = SupabaseRepository()
