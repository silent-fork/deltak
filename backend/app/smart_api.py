"""Angel One SmartAPI v2.0 REST client.

Covers the four authenticated surfaces Delta-K needs: login-by-password (TOTP),
RMS margin, order placement and position/LTP reads.  Every call funnels through
:meth:`SmartApiClient._request`, which normalises Angel One's
``{status, message, errorcode, data}`` envelope into either a payload or a
:class:`SmartApiError`.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Any

import httpx

from .config import (
    LOGIN_URL,
    LTP_URL,
    PLACE_ORDER_URL,
    POSITION_URL,
    PROFILE_URL,
    REFRESH_URL,
    RMS_URL,
    settings,
)

log = logging.getLogger("deltak.smartapi")


class SmartApiError(RuntimeError):
    """Raised when SmartAPI answers with ``status: false`` or a transport error."""

    def __init__(self, message: str, code: str | None = None, raw: Any = None):
        super().__init__(message)
        self.code = code
        self.raw = raw


class SmartApiClient:
    """Stateful SmartAPI session holder.

    A single instance lives for the lifetime of the process; ``login`` may be
    called repeatedly (e.g. re-auth after token expiry) and is concurrency-safe.
    """

    def __init__(self) -> None:
        self.api_key: str = settings.api_key
        self.client_code: str = settings.client_code
        self.jwt_token: str | None = None
        self.refresh_token: str | None = None
        self.feed_token: str | None = None
        self.login_time: datetime | None = None
        self.state: str | None = None
        self.profile: dict | None = None
        self._client: httpx.AsyncClient | None = None
        self._lock = asyncio.Lock()

    # ------------------------------------------------------------------ #
    # plumbing
    # ------------------------------------------------------------------ #
    @property
    def authenticated(self) -> bool:
        return bool(self.jwt_token and self.feed_token)

    async def _http(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                timeout=httpx.Timeout(20.0, connect=10.0),
                headers={"User-Agent": "DeltaK-Terminal/1.0"},
            )
        return self._client

    async def aclose(self) -> None:
        if self._client and not self._client.is_closed:
            await self._client.aclose()

    def _headers(self, authorized: bool = True) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "X-UserType": "USER",
            "X-SourceID": "WEB",
            "X-ClientLocalIP": settings.client_local_ip,
            "X-ClientPublicIP": settings.client_public_ip,
            "X-MACAddress": settings.mac_address,
            "X-PrivateKey": self.api_key,
        }
        if authorized:
            if not self.jwt_token:
                raise SmartApiError("Not authenticated — SmartAPI login required.")
            headers["Authorization"] = f"Bearer {self.jwt_token}"
        return headers

    async def _request(
        self,
        method: str,
        url: str,
        *,
        json_body: dict | None = None,
        authorized: bool = True,
        retries: int = 2,
    ) -> dict:
        client = await self._http()
        headers = self._headers(authorized=authorized)
        last_exc: Exception | None = None
        delay = 1.0

        for attempt in range(retries + 1):
            try:
                resp = await client.request(
                    method, url, headers=headers, json=json_body
                )
            except httpx.HTTPError as exc:  # transport failure — retry
                last_exc = exc
                if attempt < retries:
                    await asyncio.sleep(delay)
                    delay *= 2
                    continue
                raise SmartApiError(f"SmartAPI transport error: {exc}") from exc

            if resp.status_code >= 500 and attempt < retries:
                await asyncio.sleep(delay)
                delay *= 2
                continue

            try:
                payload = resp.json()
            except ValueError as exc:
                raise SmartApiError(
                    f"SmartAPI returned non-JSON (HTTP {resp.status_code})"
                ) from exc

            if resp.status_code == 401 or resp.status_code == 403:
                raise SmartApiError(
                    payload.get("message", "SmartAPI session expired"),
                    code=str(payload.get("errorcode")),
                    raw=payload,
                )

            if not payload.get("status", False):
                raise SmartApiError(
                    payload.get("message") or "SmartAPI request rejected",
                    code=str(payload.get("errorcode")),
                    raw=payload,
                )
            return payload

        raise SmartApiError(f"SmartAPI request failed: {last_exc}")

    # ------------------------------------------------------------------ #
    # auth
    # ------------------------------------------------------------------ #
    async def login(
        self,
        client_code: str,
        pin: str,
        totp: str,
        state: str | None = None,
    ) -> dict:
        """``POST /rest/auth/angelbroking/user/v1/loginByPassword``.

        ``totp`` is the six-digit code the user reads off their authenticator app
        at login time.  It is single-use and transient: it is forwarded straight
        to Angel One and never stored, logged or written to disk.  ``state`` is
        the optional passthrough string SmartAPI echoes back in the response.

        The API key comes from ``DK_API_KEY`` in the server environment, not from
        the caller.
        """
        totp = (totp or "").strip()
        if not totp:
            raise SmartApiError("A six-digit TOTP from your authenticator is required.")
        if not self.api_key:
            raise SmartApiError(
                "Server is missing DK_API_KEY — set the SmartAPI key in the "
                "deployment's secrets."
            )

        body: dict[str, str] = {
            "clientcode": client_code,
            "password": pin,
            "totp": totp,
        }
        if state:
            body["state"] = state

        async with self._lock:
            self.client_code = client_code
            payload = await self._request(
                "POST", LOGIN_URL, json_body=body, authorized=False, retries=1
            )
            data = payload.get("data") or {}
            self.jwt_token = data.get("jwtToken")
            self.refresh_token = data.get("refreshToken")
            self.feed_token = data.get("feedToken")
            self.state = data.get("state") or state
            if not self.jwt_token or not self.feed_token:
                raise SmartApiError("Login succeeded but tokens were missing.", raw=payload)
            self.login_time = datetime.now()
            log.info("SmartAPI session established for %s", client_code)

        try:
            self.profile = (await self.get_profile()).get("data")
        except SmartApiError:
            self.profile = None
        return data

    async def refresh_session(self) -> dict:
        """Re-mint the JWT with the stored refresh token."""
        if not self.refresh_token:
            raise SmartApiError("No refresh token on this session.")
        payload = await self._request(
            "POST",
            REFRESH_URL,
            json_body={"refreshToken": self.refresh_token},
            authorized=True,
            retries=1,
        )
        data = payload.get("data") or {}
        self.jwt_token = data.get("jwtToken") or self.jwt_token
        self.feed_token = data.get("feedToken") or self.feed_token
        self.refresh_token = data.get("refreshToken") or self.refresh_token
        return data

    def logout(self) -> None:
        self.jwt_token = None
        self.refresh_token = None
        self.feed_token = None
        self.profile = None
        self.login_time = None
        self.state = None

    # ------------------------------------------------------------------ #
    # authenticated reads
    # ------------------------------------------------------------------ #
    async def get_profile(self) -> dict:
        return await self._request("GET", PROFILE_URL)

    async def get_rms(self) -> dict:
        """``GET /rest/secure/angelbroking/user/v1/getRMS`` — margin snapshot."""
        payload = await self._request("GET", RMS_URL)
        return payload.get("data") or {}

    async def get_positions(self) -> list[dict]:
        payload = await self._request("GET", POSITION_URL)
        return payload.get("data") or []

    async def get_ltp(self, exchange: str, trading_symbol: str, token: str) -> dict:
        payload = await self._request(
            "POST",
            LTP_URL,
            json_body={
                "exchange": exchange,
                "tradingsymbol": trading_symbol,
                "symboltoken": token,
            },
        )
        return payload.get("data") or {}

    # ------------------------------------------------------------------ #
    # orders
    # ------------------------------------------------------------------ #
    async def place_order(
        self,
        *,
        trading_symbol: str,
        symbol_token: str,
        transaction_type: str,
        quantity: int,
        exchange: str = "NFO",
        order_type: str = "MARKET",
        product_type: str | None = None,
        duration: str = "DAY",
        price: float = 0.0,
        variety: str = "NORMAL",
        squareoff: float = 0.0,
        stoploss: float = 0.0,
    ) -> dict:
        """``POST /rest/secure/angelbroking/order/v1/placeOrder``."""
        body = {
            "variety": variety,
            "tradingsymbol": trading_symbol,
            "symboltoken": str(symbol_token),
            "transactiontype": transaction_type.upper(),
            "exchange": exchange,
            "ordertype": order_type.upper(),
            "producttype": (product_type or settings.product_type).upper(),
            "duration": duration,
            "price": f"{price:.2f}",
            "squareoff": f"{squareoff:.2f}",
            "stoploss": f"{stoploss:.2f}",
            "quantity": str(int(quantity)),
        }
        payload = await self._request("POST", PLACE_ORDER_URL, json_body=body, retries=0)
        return payload.get("data") or {}


#: Process-wide session used by the routers and the risk loop.
smart_api = SmartApiClient()
