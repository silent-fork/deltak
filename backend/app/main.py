"""Delta-K Terminal — FastAPI execution engine.

Boot sequence
-------------
1. Cold bootstrap the Angel One scrip master (unauthenticated).
2. Track the NIFTY / BANKNIFTY / FINNIFTY spot + near-ATM option universe.
3. Engage the feed (SmartStream 2.0 when a session exists, simulator otherwise).
4. Start the risk cron and the snapshot broadcaster.

Run with::

    uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .db import DB
from .risk import broadcast_loop, risk_loop
from .routers import auth, history, market, master, orders, system, webhook
from .scrip_master import bootstrap_with_retry
from .smart_api import SmartApiError, smart_api
from .state import ENGINE

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s %(name)-16s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("deltak")

BANNER = r"""
  ___      _ _         _  __   _____                   _             _
 |   \ ___| | |_ __ _ | |/ / |_   _|__ _ _ _ __ ___ (_)_ _  __ _| |
 | |) / -_) |  _/ _` ||   <    | |/ -_) '_| '  \/ -_)| | ' \/ _` | |
 |___/\___|_|\__\__,_||_|\_\   |_|\___|_| |_|_|_\___||_|_||_\__,_|_|
        DKMS · COA 1.0 / 2.0 · RRG Multi-Strike Momentum Engine
"""


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(BANNER)
    tasks: list[asyncio.Task] = []

    await DB.start(ENGINE.mode, ENGINE.ledger.capital, app.version)

    master = await bootstrap_with_retry()
    ENGINE.attach_master(master)
    ENGINE.track_universe()

    # No auto-login: SmartAPI requires a live six-digit TOTP from the user's
    # authenticator app, so the session is always established interactively via
    # the HUD's login modal (POST /api/auth/login).
    log.info("awaiting SmartAPI login — submit client code, PIN and TOTP from the HUD")

    await ENGINE.start_feed()
    await ENGINE.refresh()

    tasks.append(asyncio.create_task(risk_loop(), name="risk-loop"))
    tasks.append(asyncio.create_task(broadcast_loop(), name="broadcast-loop"))
    log.info(
        "Delta-K engine online — mode=%s simulate=%s tokens=%s",
        ENGINE.mode.value,
        ENGINE.simulating,
        ENGINE.stream.tracked_count,
    )

    try:
        yield
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        await ENGINE.stop_feed()
        await DB.stop()
        await smart_api.aclose()
        log.info("Delta-K engine shut down cleanly.")


app = FastAPI(
    title="Delta-K Terminal",
    description=(
        "Options trading HUD and signal engine implementing the Delta-K Matrix "
        "Strategy (DKMS) over Angel One SmartAPI v2.0."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(system.router)
app.include_router(master.router)
app.include_router(auth.router)
app.include_router(market.router)
app.include_router(orders.router)
app.include_router(webhook.router)
app.include_router(history.router)


@app.exception_handler(SmartApiError)
async def smartapi_error_handler(_: Request, exc: SmartApiError) -> JSONResponse:
    return JSONResponse(
        status_code=502,
        content={"detail": str(exc), "errorcode": exc.code, "source": "smartapi"},
    )


@app.get("/", tags=["system"])
async def root():
    return {
        "app": "Delta-K Terminal",
        "strategy": "Delta-K Matrix Strategy (DKMS)",
        "docs": "/docs",
        "stream": "/api/stream",
        "status": "/api/status",
    }


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run(
        "app.main:app", host=settings.host, port=settings.port, reload=False
    )
