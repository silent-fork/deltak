"""Unauthenticated cold bootstrapper for the Angel One OpenAPI scrip master.

The scrip master is a ~40 MB unauthenticated JSON dump of every tradable
instrument.  On cold start we download it once, project out the NIFTY /
BANKNIFTY / FINNIFTY index option universe plus the three index spot tokens,
and keep the result in memory (with an on-disk cache so restarts are instant).
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path

import httpx

from .config import INDEX_UNIVERSE, SCRIP_MASTER_URL, settings

log = logging.getLogger("deltak.master")

CACHE_DIR = Path(__file__).resolve().parent.parent / ".cache"
CACHE_FILE = CACHE_DIR / "scrip_master.json"
CACHE_TTL_SECONDS = 12 * 60 * 60

#: Scrip-master ``name`` values for the index spot instruments (NSE_CM segment).
SPOT_NAMES = {
    "NIFTY": {"nifty 50", "nifty"},
    "BANKNIFTY": {"nifty bank", "banknifty"},
    "FINNIFTY": {"nifty fin service", "finnifty"},
}

_MONTHS = {
    "JAN": 1, "FEB": 2, "MAR": 3, "APR": 4, "MAY": 5, "JUN": 6,
    "JUL": 7, "AUG": 8, "SEP": 9, "OCT": 10, "NOV": 11, "DEC": 12,
}


def parse_expiry(raw: str) -> date | None:
    """Parse the ``29AUG2024`` expiry format used by the scrip master."""
    raw = (raw or "").strip().upper()
    if len(raw) < 9:
        return None
    try:
        return date(int(raw[5:9]), _MONTHS[raw[2:5]], int(raw[:2]))
    except (KeyError, ValueError):
        return None


def _to_float(raw, divisor: float = 1.0) -> float:
    try:
        return float(raw) / divisor
    except (TypeError, ValueError):
        return 0.0


@dataclass(slots=True)
class Instrument:
    token: str
    symbol: str
    name: str
    exch_seg: str
    instrument_type: str
    strike: float = 0.0
    lot_size: int = 0
    expiry: date | None = None
    option_type: str | None = None  # "CE" | "PE" | None
    tick_size: float = 0.05

    def as_dict(self) -> dict:
        return {
            "token": self.token,
            "symbol": self.symbol,
            "name": self.name,
            "exch_seg": self.exch_seg,
            "instrument_type": self.instrument_type,
            "strike": self.strike,
            "lot_size": self.lot_size,
            "expiry": self.expiry.isoformat() if self.expiry else None,
            "option_type": self.option_type,
            "tick_size": self.tick_size,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Instrument":
        exp = d.get("expiry")
        return cls(
            token=d["token"],
            symbol=d["symbol"],
            name=d["name"],
            exch_seg=d["exch_seg"],
            instrument_type=d["instrument_type"],
            strike=d.get("strike", 0.0),
            lot_size=d.get("lot_size", 0),
            expiry=date.fromisoformat(exp) if exp else None,
            option_type=d.get("option_type"),
            tick_size=d.get("tick_size", 0.05),
        )


@dataclass
class ScripMaster:
    """In-memory projection of the option universe we care about."""

    loaded_at: float = 0.0
    #: underlying -> expiry -> list[Instrument]
    options: dict[str, dict[date, list[Instrument]]] = field(default_factory=dict)
    #: underlying -> spot Instrument
    spots: dict[str, Instrument] = field(default_factory=dict)
    #: token -> Instrument, for O(1) tick resolution
    by_token: dict[str, Instrument] = field(default_factory=dict)
    total_records: int = 0

    # ------------------------------------------------------------------ #
    @property
    def ready(self) -> bool:
        return bool(self.options) and bool(self.spots)

    def expiries(self, underlying: str) -> list[date]:
        return sorted(self.options.get(underlying, {}).keys())

    def nearest_expiry(self, underlying: str, on: date | None = None) -> date | None:
        """Nearest non-expired expiry (weekly for NIFTY, monthly otherwise)."""
        on = on or datetime.now().date()
        future = [e for e in self.expiries(underlying) if e >= on]
        if future:
            return future[0]
        allx = self.expiries(underlying)
        return allx[-1] if allx else None

    def contracts(
        self, underlying: str, expiry: date | None = None
    ) -> list[Instrument]:
        expiry = expiry or self.nearest_expiry(underlying)
        if expiry is None:
            return []
        return self.options.get(underlying, {}).get(expiry, [])

    def strikes(self, underlying: str, expiry: date | None = None) -> list[float]:
        return sorted({c.strike for c in self.contracts(underlying, expiry)})

    def find(
        self,
        underlying: str,
        strike: float,
        option_type: str,
        expiry: date | None = None,
    ) -> Instrument | None:
        for c in self.contracts(underlying, expiry):
            if c.option_type == option_type and abs(c.strike - strike) < 1e-6:
                return c
        return None

    def instrument(self, token: str) -> Instrument | None:
        return self.by_token.get(token)

    def lot_size(self, underlying: str) -> int:
        contracts = self.contracts(underlying)
        if contracts:
            sizes = [c.lot_size for c in contracts if c.lot_size > 0]
            if sizes:
                return max(set(sizes), key=sizes.count)
        return int(INDEX_UNIVERSE.get(underlying, {}).get("lot_size", 1))

    def summary(self) -> dict:
        return {
            "ready": self.ready,
            "loaded_at": self.loaded_at,
            "total_records": self.total_records,
            "underlyings": {
                u: {
                    "expiries": [e.isoformat() for e in self.expiries(u)][:8],
                    "nearest_expiry": (
                        self.nearest_expiry(u).isoformat()
                        if self.nearest_expiry(u)
                        else None
                    ),
                    "contracts": len(self.contracts(u)),
                    "strikes": len(self.strikes(u)),
                    "lot_size": self.lot_size(u),
                    "spot_token": self.spots[u].token if u in self.spots else None,
                }
                for u in INDEX_UNIVERSE
            },
        }

    # ------------------------------------------------------------------ #
    def ingest(self, records: list[dict]) -> "ScripMaster":
        """Project raw scrip-master records into the Delta-K universe."""
        self.options = {u: {} for u in INDEX_UNIVERSE}
        self.spots = {}
        self.by_token = {}
        self.total_records = len(records)

        spot_lookup = {
            alias: u for u, aliases in SPOT_NAMES.items() for alias in aliases
        }

        for row in records:
            try:
                seg = (row.get("exch_seg") or "").upper()
                name = (row.get("name") or "").strip()
                symbol = (row.get("symbol") or "").strip()

                if seg == "NSE":
                    key = spot_lookup.get(name.lower()) or spot_lookup.get(
                        symbol.lower()
                    )
                    # Index spots carry strike -1 and no expiry.
                    if key and key not in self.spots and not (row.get("expiry") or ""):
                        inst = Instrument(
                            token=str(row["token"]),
                            symbol=symbol or name,
                            name=key,
                            exch_seg="NSE",
                            instrument_type=row.get("instrumenttype") or "INDEX",
                            lot_size=1,
                        )
                        self.spots[key] = inst
                        self.by_token[inst.token] = inst
                    continue

                if seg != "NFO":
                    continue
                if (row.get("instrumenttype") or "").upper() != "OPTIDX":
                    continue

                upper = name.upper()
                if upper not in INDEX_UNIVERSE:
                    continue

                expiry = parse_expiry(row.get("expiry", ""))
                if expiry is None:
                    continue

                option_type = symbol[-2:].upper()
                if option_type not in ("CE", "PE"):
                    continue

                inst = Instrument(
                    token=str(row["token"]),
                    symbol=symbol,
                    name=upper,
                    exch_seg="NFO",
                    instrument_type="OPTIDX",
                    # Scrip-master strikes are quoted in paise.
                    strike=_to_float(row.get("strike"), 100.0),
                    lot_size=int(_to_float(row.get("lotsize"))) or 0,
                    expiry=expiry,
                    option_type=option_type,
                    tick_size=_to_float(row.get("tick_size"), 100.0) or 0.05,
                )
                self.options[upper].setdefault(expiry, []).append(inst)
                self.by_token[inst.token] = inst
            except Exception:  # a single malformed row must never abort bootstrap
                log.debug("skipping malformed scrip row", exc_info=True)

        # Fallback spot tokens keep the HUD alive if the master omits an index.
        for u, cfg in INDEX_UNIVERSE.items():
            if u not in self.spots:
                inst = Instrument(
                    token=cfg["spot_token_fallback"],
                    symbol=cfg["label"],
                    name=u,
                    exch_seg="NSE",
                    instrument_type="INDEX",
                    lot_size=1,
                )
                self.spots[u] = inst
                self.by_token[inst.token] = inst

        self.loaded_at = time.time()
        log.info(
            "scrip master ingested: %s records -> %s",
            self.total_records,
            {u: len(self.contracts(u)) for u in INDEX_UNIVERSE},
        )
        return self


MASTER = ScripMaster()
_lock = asyncio.Lock()


def _read_cache() -> list[dict] | None:
    if not CACHE_FILE.exists():
        return None
    if time.time() - CACHE_FILE.stat().st_mtime > CACHE_TTL_SECONDS:
        return None
    try:
        payload = json.loads(CACHE_FILE.read_text())
        return [Instrument.from_dict(d) for d in payload]  # type: ignore[return-value]
    except Exception:
        log.warning("scrip master cache unreadable — refetching")
        return None


def _write_cache(master: ScripMaster) -> None:
    try:
        CACHE_DIR.mkdir(parents=True, exist_ok=True)
        payload = [i.as_dict() for i in master.by_token.values()]
        CACHE_FILE.write_text(json.dumps(payload))
    except Exception:
        log.warning("could not persist scrip master cache", exc_info=True)


def _rehydrate(instruments: list[Instrument]) -> ScripMaster:
    m = ScripMaster()
    m.options = {u: {} for u in INDEX_UNIVERSE}
    m.total_records = len(instruments)
    for inst in instruments:
        m.by_token[inst.token] = inst
        if inst.exch_seg == "NFO" and inst.expiry:
            m.options.setdefault(inst.name, {}).setdefault(inst.expiry, []).append(inst)
        elif inst.exch_seg == "NSE":
            m.spots[inst.name] = inst
    m.loaded_at = CACHE_FILE.stat().st_mtime
    return m


async def load_master(force: bool = False) -> ScripMaster:
    """Fetch (or reuse) the scrip master.  Safe to call concurrently."""
    global MASTER
    async with _lock:
        if MASTER.ready and not force:
            return MASTER

        if not force:
            cached = _read_cache()
            if cached:
                MASTER = _rehydrate(cached)  # type: ignore[arg-type]
                log.info("scrip master restored from cache (%s)", CACHE_FILE)
                return MASTER

        log.info("cold bootstrap: downloading scrip master …")
        timeout = httpx.Timeout(120.0, connect=20.0)
        async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
            resp = await client.get(SCRIP_MASTER_URL)
            resp.raise_for_status()
            records = resp.json()

        MASTER = ScripMaster().ingest(records)
        _write_cache(MASTER)
        return MASTER


async def bootstrap_with_retry(attempts: int = 3) -> ScripMaster:
    """Cold-start helper: retries with backoff, never raises."""
    delay = 2.0
    for attempt in range(1, attempts + 1):
        try:
            return await load_master()
        except Exception as exc:
            log.warning("scrip master bootstrap attempt %s failed: %s", attempt, exc)
            if attempt == attempts:
                log.error("scrip master unavailable — running in degraded mode")
                return MASTER
            await asyncio.sleep(delay)
            delay *= 2
    return MASTER


__all__ = [
    "MASTER",
    "Instrument",
    "ScripMaster",
    "bootstrap_with_retry",
    "load_master",
    "parse_expiry",
    "settings",
]
