# Delta-K Terminal

An options trading HUD and signal engine for Indian index options, implementing
the **Delta-K Matrix Strategy (DKMS)** — a hybrid framework pairing Chart of
Accuracy (COA 1.0 & 2.0) option-chain analysis with a Relative Rotation Graph
(RRG) multi-strike momentum engine, over Angel One SmartAPI v2.0.

Covers **NIFTY 50**, **BANKNIFTY** and **FINNIFTY**.

> **Trading software carries risk.** Paper mode is the default and routes
> nothing to an exchange. Live mode places real orders with real money. Read
> [Execution modes](#execution-modes) before switching.

---

## Architecture

```
┌──────────────────────┐   SSE / WebSocket   ┌──────────────────────────┐
│  Next.js 14 HUD      │ ◀────────────────── │  FastAPI engine          │
│  (Vercel)            │   engine snapshot   │  (persistent host)       │
│                      │                     │                          │
│  · 4-quadrant matrix │ ──── REST ────────▶ │  · scrip master          │
│  · RRG scatter       │                     │  · SmartStream 2.0 WS    │
│  · signal + ledger   │                     │  · COA / RRG / DKMS      │
└──────────┬───────────┘                     │  · risk cron             │
           │                                 └────────────┬─────────────┘
           │  /api/history/*                              │  write-behind
           ▼                                              ▼
      ┌─────────────────────────── Supabase ──────────────────────────┐
      │  trading_sessions · orders · positions · signals · risk_events │
      └────────────────────────────────────────────────────────────────┘
```

The engine holds long-lived state — a SmartStream WebSocket, an in-memory tick
store, and two always-on asyncio loops. **It cannot run on serverless.** The
HUD deploys to Vercel; the engine needs a persistent container.

---

## The strategy

### COA 1.0 & 2.0 — Aegis and Zenith

| Level | Source | Meaning |
| --- | --- | --- |
| **Aegis-0 / Zenith-0** | COA 1.0 — cumulative OI walls | Static support / resistance carried into the session |
| **Aegis-1 / Zenith-1** | COA 2.0 — *intraday* ΔOI | The live bounds the engine actually trades |

Put writers stacking below spot lift Aegis-1; call writers above spot pin
Zenith-1. Migration of these levels is what selects the protocol.

### Protocol selection

| Protocol | Aegis-1 | Zenith-1 | Driver |
| --- | --- | --- | --- |
| **Alpha** — Equilibrium Range | solid | solid | Buy 2nd ITM Call at Aegis-1; 2nd ITM Put at Zenith-1 |
| **Beta** — Ascension Vector | solid | migrating up | ITM Calls on downward micro-dips; **puts banned** |
| **Gamma** — Cascade Vector | migrating down | solid | ITM Puts; **calls banned** |
| **Delta** — Volatility Trap | migrating | migrating | Auto-driver **muted** |

### RRG quadrant matrix

Each strike rotates against its index spot:

- `RS = 100 × premium / spot`
- `RS-Ratio = 100 × RS / SMA(RS, window)` — trend position
- `RS-Momentum = 100 × RS / RS[t−k]` — rate of change of that line

| Quadrant | RS-Ratio | RS-Momentum | Engine behaviour |
| --- | --- | --- | --- |
| **Leading** | > 100 | > 100 | High institutional friction; confirms the bound |
| **Improving** | < 100 | > 100 | Early breakout; unlocks Alpha scalps |
| **Weakening** | > 100 | < 100 | Fading momentum; triggers automated TP1 scale-out |
| **Lagging** | < 100 | < 100 | High decay node; **long accumulation forbidden** |

Momentum is taken on the RS line rather than on RS-Ratio deliberately: the rate
of change of an already-normalised series saturates under a steady trend and
parks genuinely trending nodes back at the origin.

### Hard invariants

- **Zero-OTM rule** — longs are restricted to the 2nd or 3rd strike deep ITM.
  ATM and OTM longs are hard-blocked to avoid theta attrition.
- **0.35 % Index Break Invalidation** — if spot breaches Aegis-1 or Zenith-1 by
  more than 0.35 %, affected positions are liquidated at market immediately.
- **3:15 PM IST Daylight Rest Protocol** — 100 % of open positions flatten
  before the 3:30 PM close. Nothing is carried overnight.

### Position sizing

```
lots = floor( (capital × risk%) / (stop_loss_points × lot_size) )
```

Then clamped by deployable capital and floored onto NSE lot increments
(NIFTY 75, BANKNIFTY 15, FINNIFTY 40 by default; resolved live from the scrip
master).

---

## Running locally

### Prerequisites

- Python 3.11+, Node 20+
- An Angel One SmartAPI app (see [Angel One setup](#angel-one-setup))
- Optional: a Supabase project for persistence

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example .env          # then fill it in
uvicorn app.main:app --reload --port 8000
```

API docs at <http://localhost:8000/docs>.

Set `DK_SIMULATE=1` to drive the HUD from a synthetic tick generator when you
have no SmartAPI session — the UI shows a persistent **SIMULATED FEED** badge
whenever it is active.

### Frontend

```bash
cd frontend
npm install
cp .env.example .env.local       # point NEXT_PUBLIC_API_URL at the engine
npm run dev
```

HUD at <http://localhost:3000>.

### Both, via Docker

```bash
cp .env.example backend/.env     # fill in
docker compose up --build
```

---

## Angel One setup

Create an app at <https://smartapi.angelone.in/>. The registration form asks for
four things:

| Field | What to enter |
| --- | --- |
| **Redirect URL** | `https://<your-domain>/auth/callback`. Delta-K uses `loginByPassword`, not the OAuth publisher flow, so this is never exercised — but the form requires a valid URL, and the app serves a real page there. |
| **Post back URL** | `https://<your-engine-host>/api/webhook/postback` — Angel One POSTs order-status updates here, which saves polling the order book. Optional; leave blank if the engine isn't publicly reachable. |
| **Primary Static IP** | The public egress IP your **engine** calls from — your ISP IP for local runs, the server's static IP once deployed. This is the field that breaks logins when wrong. |
| **Secondary Static IP** | Optional failover egress IP. |

### Authentication

Login takes **client code + PIN + the six-digit TOTP** currently displayed in
your authenticator app. The code is single-use and transient: it is forwarded
straight to Angel One and never stored, logged or written to disk. There is no
auto-login for exactly this reason — sessions are established from the HUD's
login modal and remain valid until midnight IST.

The **API key is not a login field**. It is a long-lived secret bound to the
deployment and its IP allowlist, so it lives only in the engine's environment as
`DK_API_KEY`: the browser never sees it, it is not in the request body, and it
cannot leak through a request log. Login returns `503` if the server has no key
configured.

---

## Execution modes

| | Paper (default) | Live |
| --- | --- | --- |
| Order routing | Virtual ledger | Angel One `placeOrder` → NSE |
| Fills | Live LTP + modelled slippage | Real exchange fills |
| Requires session | No | Yes |
| Circuit breakers | Active | Active |

Live mode is refused unless a SmartAPI session exists *and* a live feed is
running. Both modes share the same ledger, risk loop and panic-flatten path, so
behaviour is identical apart from where the order goes.

---

## Persistence

Supabase stores sessions, orders, positions, signals and risk events. Writes go
through a bounded write-behind queue — **the trading loop never waits on the
database**, and if Supabase is slow or unreachable the engine keeps trading and
drops the oldest queued rows rather than growing without bound. With
`DK_SUPABASE_URL` unset, the repository degrades to a no-op.

RLS is enabled on every table with **no policies**: anon and authenticated
clients get nothing. The engine writes with the service-role key, which bypasses
RLS. This is verified in the migration — an anon role sees zero rows and its
inserts are rejected.

Apply the schema with `supabase/migrations/0001_deltak_core_schema.sql`.

---

## Deployment

### HUD → Vercel

The Next.js app deploys as-is. Set these environment variables in the Vercel
project:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | Public URL of the engine, e.g. `https://engine.example.com` |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — **server-side only**, never prefixed `NEXT_PUBLIC_` |

`next.config.mjs` rewrites `/api/*` to the engine so the browser only ever talks
to its own origin (no CORS, and SSE works cleanly). `/api/history/*` is served by
a Vercel route handler reading Supabase directly — one hop instead of two, and it
keeps working when the engine is offline.

### Keeping your whitelisted IP: run the engine locally

Angel One whitelists the IP that *calls its API*. Only the engine does that, so
the simplest way to keep using the home/office IP you already registered is to
run the engine on that machine and let the hosted HUD reach it:

```
browser ──▶ Vercel HUD ──▶ tunnel ──▶ engine on your machine ──▶ Angel One
                                                                (sees YOUR IP)
```

Next.js rewrites run **server-side**, so Vercel forwards `/api/*` to whatever
`NEXT_PUBLIC_API_URL` points at. Expose the local engine with a tunnel:

```bash
uvicorn app.main:app --port 8000          # terminal 1
cloudflared tunnel --url http://localhost:8000   # terminal 2
```

Then set `NEXT_PUBLIC_API_URL` in Vercel to the tunnel URL, and add it to
`DK_CORS_ORIGINS`. Angel One still sees your machine's IP, because your machine
is what opens the connection. (Simpler still for solo use: skip Vercel and run
`npm run dev` locally too.)

**What does not work for this**, despite being tempting:

- **Calling Angel One straight from the browser.** SmartAPI's REST endpoints are
  built for server-side use and are not CORS-enabled for arbitrary origins —
  Angel One's browser-facing path is the separate Publisher Login redirect flow.
  It would also put your API key, PIN and the returned JWT/feed tokens inside
  the page, where any XSS reaches them.
- **Supabase Edge Functions.** They run on a global edge runtime with dynamic
  egress IPs; there is no static outbound IP to whitelist. (Supabase's IPv4
  add-on gives the *database* a fixed address, not function egress.)

### Engine → Railway

`backend/railway.json` + `backend/Dockerfile` deploy as-is. Set these in the
service's **Variables** (they are secrets — never put them in the frontend):

| Variable | Notes |
| --- | --- |
| `DK_API_KEY` | Your SmartAPI private key. **Server-side only** — the login form does not accept it and it never crosses the wire. |
| `DK_SUPABASE_SERVICE_KEY` | Service-role key; bypasses RLS. |
| `DK_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `DK_CLIENT_PUBLIC_IP` | The service's static outbound IP, once assigned. |
| `DK_CORS_ORIGINS` | Your Vercel URL. |

Railway injects `PORT`; the container honours it and falls back to 8000 locally.

**Static outbound IPs require the Pro plan** (Settings → Networking → Enable
Static IPs, then redeploy). Note the shape of what you get: Railway assigns
**three** IPv4 addresses and load-balances outbound traffic across all of them.
Angel One's app form has two slots (Primary + Secondary), so unless you can get
all three allowlisted, roughly a third of API calls will originate from an
un-allowlisted address and fail intermittently — which is worse than failing
outright, because it looks like flakiness. Confirm with Angel One support that
they can allowlist three before relying on this.

Run **one replica**. The tick store, ledger and RRG state are per-process; a
second replica would run a second, divergent copy of the strategy.

### Engine → anywhere else

Fly.io with a dedicated IPv4, Render, or any VM. **Not Vercel or Supabase Edge
Functions**: the engine needs always-on background loops and a long-lived
outbound WebSocket, which request-scoped runtimes cannot hold, and neither offers
a static egress IP to allowlist.

```bash
docker build -t deltak-engine ./backend
docker run -p 8000:8000 --env-file backend/.env deltak-engine
```

A single-IP host (VPS, Fly dedicated IPv4) is the cleanest fit for Angel One's
allowlist, because it gives you exactly one address to register.

---

## API surface

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/master/init` | Ingest and cache the scrip master (unauthenticated) |
| `POST` | `/api/auth/login` | Establish a SmartAPI session (client code, PIN, TOTP) |
| `GET` | `/api/auth/rms` | Available margin for pre-trade leverage checks |
| `GET` | `/api/snapshot` | One-shot engine snapshot |
| `GET` | `/api/stream` | SSE snapshot stream |
| `GET` | `/api/ws` | WebSocket snapshot stream |
| `GET` | `/api/chain/{index}` | 4-quadrant option chain with COA levels |
| `GET` | `/api/rrg/{index}` | Active RRG strike nodes |
| `GET` | `/api/signal/{index}` | Current DKMS signal |
| `POST` | `/api/calculate-size` | Risk-adjusted lot sizing |
| `POST` | `/api/order/execute` | Place an order (paper or live) |
| `POST` | `/api/order/from-signal` | One-click execution of the live signal |
| `POST` | `/api/order/exit` | Close one position |
| `POST` | `/api/order/scale-out` | Partial TP1 exit |
| `POST` | `/api/order/panic-exit` | **Flatten everything** |
| `POST` | `/api/webhook/postback` | Angel One order postback receiver |
| `GET` | `/api/history/*` | Persisted sessions, orders, positions, signals, events |

---

## Tests

```bash
cd backend && python -m pytest -q
```

Covers position sizing, RRG quadrant rotation, COA level derivation, DKMS
protocol classification and the Zero-OTM rule, ledger PnL and scale-outs, the
0.35 % invalidation band, the Daylight Rest countdown, SmartStream binary frame
decoding, and the persistence layer's batching and back-pressure.

---

## Project layout

```
backend/
  app/
    main.py            FastAPI app and boot sequence
    config.py          every strategy knob, env-driven
    scrip_master.py    unauthenticated cold bootstrapper
    smart_api.py       SmartAPI v2.0 REST client
    ws_manager.py      SmartStream 2.0 feed + binary decoding
    engine/
      coa.py           COA 1.0/2.0 chain builder, Aegis/Zenith
      rrg.py           RS-Ratio / RS-Momentum engine
      dkms.py          protocol selection and signal generation
      sizing.py        risk-adjusted lot sizing
    ledger.py          virtual execution ledger
    execution.py       paper/live order router
    risk.py            circuit breakers and the cron loop
    db.py              Supabase write-behind repository
frontend/
  app/                 App Router pages and route handlers
  components/          HUD panels
  lib/                 wire types, API client, SSE hook
supabase/migrations/   database schema
```
