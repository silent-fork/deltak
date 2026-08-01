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
┌────────────────────────────────────────────┐   direct WS   ┌───────────────┐
│  Next.js HUD (Vercel, fully serverless)     │ ◀──────────── │  SmartStream  │
│                                              │               │  2.0 feed     │
│  · engine runs in the browser (1 Hz tick)   │               └───────────────┘
│    scrip master → COA → RRG → DKMS → ledger │
│  · 4-quadrant matrix · RRG scatter          │
│  · signal + ledger                          │
└──────────────┬───────────────────────────────┘
               │  /api/auth, /api/order, /api/market/*, /api/persist, /api/history/*
               ▼
      ┌─────────────────────────── Supabase ──────────────────────────┐
      │  trading_sessions · orders · positions · signals · risk_events │
      └────────────────────────────────────────────────────────────────┘
```

There is no separate backend to host. The signal engine (COA, RRG, DKMS,
ledger, risk guards) runs client-side on a 1 Hz timer; a handful of Next.js
route handlers under `web/app/api` cover what the browser can't do directly —
the SmartAPI login exchange (keeps `DK_API_KEY` server-side) and Supabase
persistence (keeps the service-role key server-side). Everything deploys as
one Vercel project.

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

### Historical context

The live feed only knows what has happened since the socket opened, which is
enough to price a trade and wrong for nearly everything else the HUD claims to
show. Angel One's historical and market-data reads fill that in, on their own
slow timers, entirely outside the trading loop:

| API | What it fixes |
| --- | --- |
| `getCandleData` | The session's real shape — one-minute bars from 9:15, so the spot trace, day high/low and the previous close exist on the first paint instead of accumulating from page load |
| `getOIData` | **The COA 2.0 baseline.** ΔOI is measured against the exchange's own session-open open interest, not against whatever the first frame this tab received happened to carry. The same series rebuilds the wall-migration trail, bucket by bucket, at no extra request |
| `putCallRatio` | Cumulative PCR across *every* strike, set beside the chain window's own — a window far from the cumulative reading says the weight sits outside the rendered ladder |
| `OIBuildup` | Long Built Up / Short Built Up / Short Covering / Long Unwinding across the F&O board. Served by the route below, but nothing renders it today, so nothing polls it |

### Out of hours

With the market shut the socket sends nothing, and a terminal whose every price
is zero cannot build a chain, let alone rotate one. So when `isMarketOpen()` is
false the board is reconstructed from the last session instead: the index closes
from `getCandleData`, each contract's closing premium and volume from the same
endpoint, its closing open interest from `getOIData`, and — the part that cannot
be faked from a snapshot — each contract's *series* replayed bar by bar into its
RRG window, which is exactly what the feed would have fed it live.

Two guards keep that from being mistaken for a live terminal. Seeded quotes do
not advance the tick counter, so the Live-mode switch still refuses to route
without a real feed; and the rotation windows only advance on genuine prints, so
the 1 Hz loop cannot bury a replayed session under a minute of repeated closes.

The OI baseline is the one that matters most. Without it a terminal opened at
noon reads every strike as "no change", Aegis-1 and Zenith-1 silently collapse
back onto the static COA 1.0 walls, and the protocol selector is choosing
between levels that no longer describe today.

These endpoints are metered per API key at a few requests a second, so every
call in the tab funnels through one queue that spaces requests out, shares
in-flight requests, caches by window, and widens its spacing when Angel One
answers with a throttle. Baselines are fetched for the strikes nearest the
money first, and only for the instrument on screen. Nothing here can block the
1 Hz loop or a circuit breaker: every panel renders from the live feed alone
and simply gets sharper as these land.

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

- Node 20+
- An Angel One SmartAPI app (see [Angel One setup](#angel-one-setup))
- Optional: a Supabase project for persistence

### HUD + engine

```bash
cd web
npm install
cp .env.example .env.local       # fill in DK_API_KEY, Supabase, etc.
npm run dev
```

HUD at <http://localhost:3000>.

Set `NEXT_PUBLIC_SIMULATE=1` to drive the HUD from a synthetic tick generator
when you have no SmartAPI session — the UI shows a persistent **SIMULATED
FEED** badge whenever it is active.

---

## Angel One setup

Create an app at <https://smartapi.angelone.in/>. The registration form asks for
four things:

| Field | What to enter |
| --- | --- |
| **Redirect URL** | `https://<your-domain>/auth/callback`. Delta-K uses `loginByPassword`, not the OAuth publisher flow, so this is never exercised — but the form requires a valid URL, and the app serves a real page there. |
| **Primary Static IP** | The public egress IP the `/api/auth/login` route calls Angel One from — your ISP IP for local runs, Vercel's outbound IP once deployed. This is the field that breaks logins when wrong. |
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
`SUPABASE_URL` unset, the repository degrades to a no-op.

RLS is enabled on every table with **no policies**: anon and authenticated
clients get nothing. The engine writes with the service-role key, which bypasses
RLS. This is verified in the migration — an anon role sees zero rows and its
inserts are rejected.

Apply the schema with `supabase/migrations/0001_deltak_core_schema.sql`.

---

## Deployment

### Vercel

The `web/` app deploys as-is — one project, no separate service to host. Set
these environment variables (see `web/.env.example` for the full list):

| Variable | Value |
| --- | --- |
| `DK_API_KEY` | Your SmartAPI private key. **Server-side only** — read by `/api/auth/login`, never sent in a request body. |
| `DK_CLIENT_LOCAL_IP` / `DK_CLIENT_PUBLIC_IP` | Client identity headers Angel One expects on REST calls. |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — **server-side only**, never prefixed `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_SIMULATE` | `1` to force the synthetic feed. |

There is no engine host, no static outbound IP to provision, and no always-on
process to keep alive — the whole app is stateless request handlers plus a
browser-side timer.

### Keeping your whitelisted IP

Angel One whitelists the IP that *calls its API*. On Vercel, that's Vercel's
egress IP (via `/api/auth/login`), which is why the SmartAPI app's Primary
Static IP field should point there once deployed. For local development the
call originates from your own machine, so register your ISP IP instead — or
run `npm run dev` and use the terminal purely locally, which needs no
whitelisting changes at all.

---

## API surface

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/master` | Ingest and cache the scrip master (unauthenticated, edge-cached 1h) |
| `POST` | `/api/auth/login` | Establish a SmartAPI session (client code, PIN, TOTP) |
| `POST` | `/api/auth/logout` | Clear the session cookie |
| `GET` | `/api/rms` | Available margin for pre-trade leverage checks |
| `POST` | `/api/market/candles` | Historical candles (`getCandleData`), normalised and sliced to the last trading session |
| `POST` | `/api/market/oi` | Historical open interest (`getOIData`) for a live F&O contract |
| `GET` | `/api/market/pcr` | Cumulative market-wide Put-Call Ratio (`putCallRatio`) |
| `POST` | `/api/market/buildup` | OI buildup classes (`OIBuildup`) for an expiry bucket |
| `POST` | `/api/order` | Place a live order via Angel One `placeOrder` |
| `POST` | `/api/persist` | Append engine records (orders, positions, signals, risk events) to Supabase |
| `GET` | `/api/history/:resource` | Read persisted sessions, orders, positions, signals or risk events |

The chain, RRG, DKMS signal and paper-mode ledger have no routes — they run
entirely client-side in `web/lib/useEngine.ts` and never leave the tab.

---

## Tests

```bash
cd web && npm test
```

Covers position sizing, RRG quadrant rotation, COA level derivation, DKMS
protocol classification and the Zero-OTM rule, signal geometry, and the
historical layer — candle/OI/PCR/buildup parsing, session slicing, request
validation against the per-interval day caps, and the ΔOI baseline correction.

---

## Project layout

```
web/
  app/
    api/
      master/            scrip master cold bootstrap
      auth/login,logout/ SmartAPI session exchange
      rms/                available margin
      order/              live order placement
      persist/            Supabase write-behind
      history/[resource]/ Supabase read-back
      market/             historical candles, OI, PCR, OI buildup
    page.tsx, layout.tsx  HUD shell
  components/            HUD panels (chain, RRG scatter, order book, signal panel)
  lib/
    engine/
      coa.ts             COA 1.0/2.0 chain builder, Aegis/Zenith
      rrg.ts             RS-Ratio / RS-Momentum engine
      dkms.ts            protocol selection and signal generation
      sizing.ts          risk-adjusted lot sizing
      ledger.ts          virtual execution ledger
      risk.ts            circuit breakers
      scripMaster.ts     scrip master parsing
      config.ts          every strategy knob, env-driven
    stream/
      smartstream.ts     SmartStream 2.0 feed + binary decoding
      simFeed.ts         synthetic tick generator
      ticks.ts           in-browser tick store
    market/
      constants.ts       intervals, day caps, exchange and buildup vocabulary
      request.ts         historical request validation
      parse.ts           payload normalisers, session slicing, PCR mapping
      clock.ts           IST request windows
      client.ts          rate-limited, cached browser client
    server/smartapi.ts   SmartAPI v2.0 REST client (server-only)
    supabase.ts          Supabase client
    useEngine.ts         the engine loop itself — runs in the browser
    useMarketData.ts     historical context polling and ΔOI baselining
  tests/                 engine unit tests
supabase/migrations/     database schema
```
