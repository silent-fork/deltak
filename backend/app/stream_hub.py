"""Fan-out hub for HUD clients.

The same :class:`~app.schemas.EngineSnapshot` payload is delivered over two
transports so the frontend can use whichever it prefers:

* **SSE** — ``GET /api/stream`` (default; survives proxies, auto-reconnects).
* **WebSocket** — ``GET /api/ws`` for lower-latency bidirectional use.

Each subscriber gets a bounded queue; a slow client drops frames instead of
back-pressuring the engine.
"""

from __future__ import annotations

import asyncio
import logging

from .schemas import EngineSnapshot

log = logging.getLogger("deltak.hub")

QUEUE_SIZE = 4


class StreamHub:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[str]] = set()
        self._last: str | None = None
        self.frames_published = 0

    @property
    def has_clients(self) -> bool:
        return bool(self._subscribers)

    @property
    def client_count(self) -> int:
        return len(self._subscribers)

    def subscribe(self) -> asyncio.Queue[str]:
        queue: asyncio.Queue[str] = asyncio.Queue(maxsize=QUEUE_SIZE)
        self._subscribers.add(queue)
        if self._last is not None:
            queue.put_nowait(self._last)  # instant first paint
        return queue

    def unsubscribe(self, queue: asyncio.Queue[str]) -> None:
        self._subscribers.discard(queue)

    async def publish(self, snapshot: EngineSnapshot) -> None:
        payload = snapshot.model_dump_json()
        self._last = payload
        self.frames_published += 1
        for queue in list(self._subscribers):
            try:
                queue.put_nowait(payload)
            except asyncio.QueueFull:
                # Slow consumer: drop the oldest frame and keep the newest.
                try:
                    queue.get_nowait()
                    queue.put_nowait(payload)
                except (asyncio.QueueEmpty, asyncio.QueueFull):
                    pass

    @property
    def last_frame(self) -> str | None:
        return self._last


HUB = StreamHub()
