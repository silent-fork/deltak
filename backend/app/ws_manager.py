"""SmartStream 2.0 WebSocket manager.

Maintains a resilient connection to ``wss://smartapisocket.angelone.in/smart-stream``,
subscribes the Delta-K token universe in **Mode 3 (Snap Quote)** — LTP, volume,
open interest and best bid/ask — decodes the little-endian binary frames and
publishes normalised :class:`~app.schemas.Tick` objects to the tick store.

Binary layout (SmartStream 2.0, little-endian):

===========  ======  ==========================================================
Offset       Bytes   Field
===========  ======  ==========================================================
0            1       subscription mode (1 = LTP, 2 = Quote, 3 = Snap Quote)
1            1       exchange type
2            25      token (null-padded ASCII)
27           8       sequence number (int64)
35           8       exchange timestamp, epoch ms (int64)
43           8       last traded price ×100 (int64)
-- mode >= 2 --
51           8       last traded quantity
59           8       average traded price ×100
67           8       volume traded for the day
75           8       total buy quantity (double)
83           8       total sell quantity (double)
91/99/107/115 8 ea.  open / high / low / close ×100
-- mode 3 --
123          8       last traded timestamp
131          8       open interest
139          8       open interest change % (double)
147          200     best five buy/sell (10 × 20-byte packets)
347/355      8 ea.   upper / lower circuit limit ×100
363/371      8 ea.   52-week high / low ×100
===========  ======  ==========================================================
"""

from __future__ import annotations

import asyncio
import json
import logging
import struct
import time
from collections.abc import Iterable

import websockets

from .config import EXCHANGE_NSE_CM, EXCHANGE_NSE_FO, SMART_STREAM_URL
from .schemas import Tick

log = logging.getLogger("deltak.stream")

PRICE_DIVISOR = 100.0
HEARTBEAT_INTERVAL = 25.0
MAX_TOKENS_PER_REQUEST = 1000

ACTION_SUBSCRIBE = 1
ACTION_UNSUBSCRIBE = 0
MODE_SNAP_QUOTE = 3


# --------------------------------------------------------------------------- #
# binary decoding
# --------------------------------------------------------------------------- #
def _i64(buf: bytes, off: int) -> int:
    return struct.unpack_from("<q", buf, off)[0]


def _f64(buf: bytes, off: int) -> float:
    return struct.unpack_from("<d", buf, off)[0]


def decode_packet(buf: bytes) -> Tick | None:
    """Decode one SmartStream binary frame into a :class:`Tick`.

    Returns ``None`` for frames that are too short to be meaningful rather than
    raising — a truncated frame must never kill the reader loop.
    """
    if len(buf) < 51:
        return None

    mode = buf[0]
    token = buf[2:27].split(b"\x00", 1)[0].decode("utf-8", errors="ignore").strip()
    if not token:
        return None

    tick = Tick(
        token=token,
        exchange_ts=_i64(buf, 35),
        ltp=_i64(buf, 43) / PRICE_DIVISOR,
    )

    if mode >= 2 and len(buf) >= 123:
        tick.volume = _i64(buf, 67)
        tick.open = _i64(buf, 91) / PRICE_DIVISOR
        tick.high = _i64(buf, 99) / PRICE_DIVISOR
        tick.low = _i64(buf, 107) / PRICE_DIVISOR
        tick.close = _i64(buf, 115) / PRICE_DIVISOR

    if mode == MODE_SNAP_QUOTE and len(buf) >= 379:
        tick.oi = _i64(buf, 131)
        tick.oi_change_pct = _f64(buf, 139)
        best_bid = 0.0
        best_ask = 0.0
        # Ten 20-byte depth packets: [int16 buy/sell][int64 qty][int64 price][int16 orders]
        for i in range(10):
            off = 147 + i * 20
            is_buy = struct.unpack_from("<h", buf, off)[0] == 1
            price = _i64(buf, off + 10) / PRICE_DIVISOR
            if price <= 0:
                continue
            if is_buy:
                best_bid = max(best_bid, price)
            else:
                best_ask = price if best_ask == 0.0 else min(best_ask, price)
        tick.best_bid = best_bid
        tick.best_ask = best_ask

    return tick


# --------------------------------------------------------------------------- #
# tick store
# --------------------------------------------------------------------------- #
class TickStore:
    """Last-value cache for every subscribed token, plus tick bookkeeping."""

    def __init__(self) -> None:
        self._ticks: dict[str, Tick] = {}
        self._prev_ltp: dict[str, float] = {}
        #: token -> first OI seen today, used for the COA 2.0 intraday ΔOI.
        self._session_open_oi: dict[str, int] = {}
        self.updates: int = 0
        self.last_update_ts: float = 0.0

    def apply(self, tick: Tick) -> Tick:
        prev = self._ticks.get(tick.token)
        if prev is not None:
            self._prev_ltp[tick.token] = prev.ltp
            # Snap-quote frames occasionally omit fields; carry the last value.
            if tick.volume == 0:
                tick.volume = prev.volume
            if tick.oi == 0:
                tick.oi = prev.oi
            if tick.close == 0:
                tick.close = prev.close
        if tick.oi and tick.token not in self._session_open_oi:
            self._session_open_oi[tick.token] = tick.oi
        self._ticks[tick.token] = tick
        self.updates += 1
        self.last_update_ts = time.time()
        return tick

    def get(self, token: str) -> Tick | None:
        return self._ticks.get(token)

    def ltp(self, token: str, default: float = 0.0) -> float:
        t = self._ticks.get(token)
        return t.ltp if t and t.ltp else default

    def prev_ltp(self, token: str) -> float:
        return self._prev_ltp.get(token, 0.0)

    def oi_change(self, token: str) -> int:
        t = self._ticks.get(token)
        if not t:
            return 0
        return t.oi - self._session_open_oi.get(token, t.oi)

    def seed(self, tick: Tick) -> None:
        """Inject a tick without touching counters (used by the replay feed)."""
        self.apply(tick)

    def reset_session(self) -> None:
        self._session_open_oi.clear()

    def snapshot(self) -> dict[str, Tick]:
        return dict(self._ticks)


TICKS = TickStore()


# --------------------------------------------------------------------------- #
# connection manager
# --------------------------------------------------------------------------- #
class SmartStreamManager:
    """Owns the SmartStream socket lifecycle with auto-reconnect."""

    def __init__(self, store: TickStore | None = None) -> None:
        self.store = store or TICKS
        self.connected: bool = False
        self.last_error: str | None = None
        self.reconnects: int = 0
        self._ws: websockets.WebSocketClientProtocol | None = None
        self._task: asyncio.Task | None = None
        self._heartbeat: asyncio.Task | None = None
        self._stop = asyncio.Event()
        self._subscriptions: dict[int, set[str]] = {
            EXCHANGE_NSE_CM: set(),
            EXCHANGE_NSE_FO: set(),
        }
        self._listeners: list = []
        self._creds: tuple[str, str, str] | None = None

    # -- lifecycle ----------------------------------------------------- #
    async def start(self, client_code: str, feed_token: str, api_key: str) -> None:
        """(Re)start the feed with a fresh session."""
        await self.stop()
        self._creds = (client_code, feed_token, api_key)
        self._stop.clear()
        self._task = asyncio.create_task(self._run(), name="smartstream-reader")

    async def stop(self) -> None:
        self._stop.set()
        for task in (self._heartbeat, self._task):
            if task and not task.done():
                task.cancel()
                try:
                    await task
                except (asyncio.CancelledError, Exception):  # noqa: BLE001
                    pass
        self._heartbeat = None
        self._task = None
        if self._ws is not None:
            try:
                await self._ws.close()
            except Exception:  # noqa: BLE001
                pass
            self._ws = None
        self.connected = False

    def add_listener(self, callback) -> None:
        """Register ``callback(tick)`` — invoked for every decoded tick."""
        self._listeners.append(callback)

    # -- subscriptions -------------------------------------------------- #
    def track(self, exchange_type: int, tokens: Iterable[str]) -> set[str]:
        """Add tokens to the tracked set; returns the newly added tokens."""
        current = self._subscriptions.setdefault(exchange_type, set())
        incoming = {str(t) for t in tokens if t}
        new = incoming - current
        current |= incoming
        return new

    @property
    def tracked_count(self) -> int:
        return sum(len(v) for v in self._subscriptions.values())

    async def sync_subscriptions(self, only: dict[int, set[str]] | None = None) -> None:
        """Push the tracked token set (or a delta) to the socket."""
        if not self._ws or not self.connected:
            return
        source = only if only is not None else self._subscriptions
        token_list = []
        for exch, tokens in source.items():
            tokens = [t for t in tokens if t]
            for i in range(0, len(tokens), MAX_TOKENS_PER_REQUEST):
                token_list.append(
                    {
                        "exchangeType": exch,
                        "tokens": tokens[i : i + MAX_TOKENS_PER_REQUEST],
                    }
                )
        if not token_list:
            return
        request = {
            "correlationID": f"deltak-{int(time.time())}",
            "action": ACTION_SUBSCRIBE,
            "params": {"mode": MODE_SNAP_QUOTE, "tokenList": token_list},
        }
        try:
            await self._ws.send(json.dumps(request))
            log.info(
                "subscribed mode-3 snap quote for %s tokens",
                sum(len(g["tokens"]) for g in token_list),
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("subscription push failed: %s", exc)

    async def subscribe_new(self, exchange_type: int, tokens: Iterable[str]) -> None:
        """Track *and* immediately subscribe only the tokens that are new."""
        new = self.track(exchange_type, tokens)
        if new:
            await self.sync_subscriptions({exchange_type: new})

    # -- internals ------------------------------------------------------ #
    def _url(self) -> str:
        client_code, feed_token, api_key = self._creds  # type: ignore[misc]
        return (
            f"{SMART_STREAM_URL}?clientCode={client_code}"
            f"&feedToken={feed_token}&apiKey={api_key}"
        )

    def _headers(self) -> dict[str, str]:
        client_code, feed_token, api_key = self._creds  # type: ignore[misc]
        # SmartStream accepts credentials via query string *or* headers; send
        # both so the handshake survives either gateway configuration.
        return {
            "Authorization": feed_token,
            "x-api-key": api_key,
            "x-client-code": client_code,
            "x-feed-token": feed_token,
        }

    async def _run(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            try:
                async with websockets.connect(
                    self._url(),
                    additional_headers=self._headers(),
                    ping_interval=None,  # SmartStream uses its own "ping" text frame
                    close_timeout=5,
                    max_size=None,
                ) as ws:
                    self._ws = ws
                    self.connected = True
                    self.last_error = None
                    backoff = 1.0
                    log.info("SmartStream connected (%s tokens)", self.tracked_count)

                    self._heartbeat = asyncio.create_task(self._ping_loop(ws))
                    await self.sync_subscriptions()
                    await self._read_loop(ws)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                self.last_error = str(exc)
                log.warning("SmartStream disconnected: %s", exc)
            finally:
                self.connected = False
                self._ws = None
                if self._heartbeat and not self._heartbeat.done():
                    self._heartbeat.cancel()

            if self._stop.is_set():
                break
            self.reconnects += 1
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30.0)

    async def _ping_loop(self, ws) -> None:
        try:
            while True:
                await asyncio.sleep(HEARTBEAT_INTERVAL)
                await ws.send("ping")
        except (asyncio.CancelledError, Exception):  # noqa: BLE001
            return

    async def _read_loop(self, ws) -> None:
        async for raw in ws:
            if self._stop.is_set():
                return
            if isinstance(raw, str):
                continue  # "pong" heartbeat echo
            tick = decode_packet(raw)
            if tick is None:
                continue
            self.store.apply(tick)
            for cb in self._listeners:
                try:
                    cb(tick)
                except Exception:  # noqa: BLE001
                    log.debug("tick listener raised", exc_info=True)


STREAM = SmartStreamManager()
