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
      ┌──────────────────────── Supabase ───────────────────────┐
      │  user_profiles · positions · orders · risk_events        │
      └──────────────────────────────────────────────────────────┘
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
| **Aegis-0 / Zenith-0** — the *Vanguard* | COA 1.0 — cumulative OI walls | The standing mass of open interest across sessions: the strike the bound settles onto when today's writing fades or rolls |
| **Aegis-1 / Zenith-1** | COA 2.0 — *intraday* ΔOI | The live bounds the engine actually trades |

The HUD names the cumulative wall **Vanguard** rather than "prior": it is not a
spent level but the position held out ahead of the live one.

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

Three guards keep that from being mistaken for a live terminal, and all three
turn on one distinction: **a connected socket is not a running market.**
SmartStream accepts a subscription at any hour and then sends nothing, so
"feed is live" and "the exchange is trading" are different questions — the
header reads `Linked` rather than `Live` when only the first is true.

- Seeded quotes do not advance the tick counter, so the Live-mode switch still
  refuses to route without a real feed.
- Rotation advances only when the market is trading *and* something printed.
- Once replayed data has settled the pipeline stops: rebuilding a frozen chain
  once a second recomputes the same answer forever while grinding down the very
  history the replay installed. The footer reads `Settled` while it idles.

Risk guards run for the whole session rather than per print — the 3:15 PM
Daylight Rest is a clock event and a quiet second must not skip it — and idle
out of hours, when the exchange could not fill an exit anyway. These rules live
in `lib/engine/loop.ts` as one pure function, and are tested there.

The OI baseline is the one that matters most. Without it a terminal opened at
noon reads every strike as "no change", Aegis-1 and Zenith-1 silently collapse
back onto the static COA 1.0 walls, and the protocol selector is choosing
between levels that no longer describe today.

These endpoints are metered per API key at a few requests a second, so every
call in the tab funnels through one queue that spaces requests out, shares
in-flight requests, caches by window, and widens its spacing when Angel One
answers with a throttle. A ladder is asked for as a *batch*: 22 strikes were 44
round trips through this deployment before anything could be drawn, each one's
latency sitting in series with the limiter, so `/api/market/batch` takes the
chunk and fans out from a machine already next to the broker. Every contract in
a batch is pinned to one session — asking each token for "its own last session"
let an illiquid strike answer with a different day from its neighbours, and put
a stale premium in the ladder beside live ones. Baselines are fetched for the strikes nearest the
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

## The operator

`getProfile` runs immediately after login, and again on every session restore —
it is also the cheapest proof a JWT is still alive, so the terminal gets an
identity for free. What comes back (name, email, mobile, broker, enabled
segments and product types) is written to `user_profiles` and shown in the
**user pill** at the right of the header: initials, name, client code and a live
dot, opening onto the full profile, the broker's available margin and the day's
book, with sign-out.

Nothing in that table is a credential. The order-placing JWT stays in the
httpOnly cookie the page cannot read, and the profile is fetched server-side.

## Persistence

Supabase stores the operator's profile, positions, orders and risk events.
Writes are fire-and-forget — **the trading loop never waits on the database**,
and if Supabase is slow or unreachable the engine keeps trading. With
`SUPABASE_URL` unset, persistence degrades to a no-op.

| Table | Written when |
| --- | --- |
| `user_profiles` | Every login and session restore, upserted on client code |
| `positions` | On entry, on every scale-out and exit, and as a checkpoint each minute while a position is open |
| `orders` | Every executed leg, and every live order the broker *rejected* |
| `risk_events` | Every circuit-breaker, fill and session notice |

**Active and closed trades are the same row.** A position is upserted on a
`trade_key` — the account, the ledger id and the moment it opened — so the
entry, its mark-to-market checkpoints and its exit collapse onto one row that
moves from `OPEN` to `CLOSED` rather than a trail of duplicates.

Attribution is stamped server-side from the session cookie: a trade is filed
under the account whose session wrote it, never under whatever the request body
claims. History reads are scoped the same way, and require a session.

RLS is enabled on every table with **no policies**: anon and authenticated
clients get nothing. The engine writes with the service-role key, which bypasses
RLS, and reads go back through this app's own routes.

Apply `supabase/migrations/` in order. `0002` adds the profile table and trade
attribution; `0003` drops `trading_sessions`, `signals`, `engine_settings` and
the `session_performance` view — schema carried over from the retired FastAPI
engine that nothing in the serverless build ever read or wrote.

## Human verification

The sign-in form relays a client code, PIN and TOTP to Angel One. In front of it
sits **Cloudflare Turnstile**, so a public deployment is not a free
credential-stuffing endpoint against a broker's rate limits and lockouts.

It is non-interactive by design: the widget renders in `interaction-only`
appearance and `execute` mode, so the operator sees the sign-in button spin and
nothing more. The token is verified server-side before the login route touches
Angel One.

- `NEXT_PUBLIC_DK_TURNSTILE_SITE_KEY` — public, rendered into the page
- `DK_TURNSTILE_SECRET_KEY` — server-side only; setting it is what turns the check on
- `NEXT_PUBLIC_DK_TURNSTILE_ENABLED=0` — takes the gate out of the path entirely,
  for local work and end-to-end tests. Both halves read this variable, so the
  browser and the server never disagree about whether a token is expected.

If Cloudflare itself is unreachable the login proceeds: the check filters
automated abuse, it is not an authentication factor — the TOTP behind it is.

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
| `NEXT_PUBLIC_DK_TURNSTILE_SITE_KEY` | Cloudflare Turnstile site key. Public by design. |
| `DK_TURNSTILE_SECRET_KEY` | Turnstile secret — **server-side only**. Setting it enables verification. |
| `NEXT_PUBLIC_DK_TURNSTILE_ENABLED` | `0` to switch the check off for testing. Anything else, including unset, leaves it on. |
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
| `POST` | `/api/auth/login` | Establish a SmartAPI session (client code, PIN, TOTP), behind Turnstile; reads and stores the profile |
| `GET` | `/api/auth/session` | Revalidate the cookie against the broker, refresh across the daily expiry, return the profile |
| `GET` | `/api/auth/profile` | The signed-in operator, in full. Scoped to the session cookie |
| `PATCH` | `/api/auth/profile` | Correct this terminal's stored email or mobile number — SmartAPI has no write path for either |
| `POST` | `/api/auth/logout` | Invalidate the JWT at Angel One (`logout`, best-effort), then clear the session cookie |
| `GET` | `/api/rms` | Available margin for pre-trade leverage checks |
| `POST` | `/api/market/candles` | Historical candles (`getCandleData`), normalised and sliced to the last trading session |
| `POST` | `/api/market/oi` | Historical open interest (`getOIData`) for a live F&O contract |
| `POST` | `/api/market/batch` | A whole ladder's session — candles and OI for up to 25 contracts, fanned out server-side |
| `GET` | `/api/market/pcr` | Cumulative market-wide Put-Call Ratio (`putCallRatio`) |
| `POST` | `/api/market/buildup` | OI buildup classes (`OIBuildup`) for an expiry bucket |
| `POST` | `/api/order` | Place a live order via Angel One `placeOrder` |
| `POST` | `/api/persist` | Append positions, orders and risk events to Supabase, attributed from the session cookie |
| `GET` | `/api/history/:resource` | Read back this account's persisted positions, orders or risk events |

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
      auth/                SmartAPI session exchange, restore, profile
      rms/                available margin
      order/              live order placement
      persist/            Supabase writes, attributed from the cookie
      history/[resource]/ Supabase read-back, scoped to the account
      market/             historical candles, OI, PCR, OI buildup
    page.tsx, layout.tsx  HUD shell
  components/            HUD panels (chain, RRG scatter, order book, signal panel)
                         plus the header user pill
  lib/
    engine/
      coa.ts             COA 1.0/2.0 chain builder, Aegis/Zenith
      rrg.ts             RS-Ratio / RS-Momentum engine
      dkms.ts            protocol selection and signal generation
      sizing.ts          risk-adjusted lot sizing
      ledger.ts          virtual execution ledger
      persist.ts         ledger objects → Supabase rows
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
    server/
      smartapi.ts        SmartAPI v2.0 REST client (server-only)
      profile.ts         getProfile → normalise → store
      turnstile.ts       Cloudflare Turnstile verification
    supabase.ts          Supabase client
    useTurnstile.ts      the non-interactive challenge, browser side
    useEngine.ts         the engine loop itself — runs in the browser
    useMarketData.ts     historical context polling and ΔOI baselining
  tests/                 engine unit tests
supabase/migrations/     database schema
```
