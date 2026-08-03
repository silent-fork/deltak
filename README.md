# DeltaK Terminal

An options trading terminal for Indian index options, built around the
**DeltaK Matrix Strategy (DKMS)** — a hybrid framework pairing Chart of
Accuracy (COA 1.0 & 2.0) option-chain analysis with a Relative Rotation Graph
(RRG) multi-strike momentum engine, over Angel One SmartAPI v2.0. Sign in with
your own Angel One account, watch the engine read wall migration and rotation
live, and let it either arm a trade for you to take or take it itself.

Covers **NIFTY 50**, **BANKNIFTY** and **FINNIFTY**.

> **Trading software carries risk.** Paper mode is the default and routes
> nothing to an exchange. Live mode places real orders with real money. Read
> [Execution modes](#execution-modes) before switching.

## What's here

- **The DKMS engine** — four protocols (Alpha/Beta/Gamma/Delta), selected live
  off how the Aegis (support) and Zenith (resistance) walls are actually
  migrating this session, never a setting anyone chooses. See
  [The strategy](#the-strategy).
- **A 4-quadrant option chain** — calls and puts read outward from the strike
  column, each leg carrying its own RRG quadrant, RS-Ratio, volume, open
  interest and bid/ask spread.
- **Autopilot** — an actionable signal fires itself the instant every gate
  agrees, or waits for a manual Execute click. Same sizing, same risk gates,
  either way. See [Autopilot](#autopilot).
- **Risk guards that don't need a tab open** — stop-loss, target and the 3:15
  PM Daylight Rest flatten run through `/api/watchdog/tick` independently of
  any open browser tab. See [Watchdog](#watchdog).
- **A read-only mobile companion** — pair a phone by QR, no separate login;
  it mirrors the desktop's live signal and trade book and can never place an
  order. See [Mobile companion](#mobile-companion).
- **`/learn` — a free, static options-trading wiki** — no login, no user
  input, nothing computed per-visitor: strategy payoff diagrams, an options
  and Indian F&O glossary (including this project's own Aegis/Zenith/Quantum
  Horizon/DKMS vocabulary), trading styles, and index reference. See
  [Learn — the public wiki](#learn--the-public-wiki).
- **Paper mode by default** — the whole engine, including Autopilot and every
  risk guard, runs against simulated fills with no live order ever placed,
  for as long as you want to watch it work.

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

## Learn — the public wiki

`/learn` is a second, entirely separate surface from the terminal above: a
free, static reference wiki, no login and no data input from a visitor at
all. Every page is server-rendered from a fixed content module at build time
— there is no calculator, no form, no per-visitor computation — which is what
lets the whole section live outside `noindex` and actually rank.

| Section | Pages | Content |
| --- | --- | --- |
| `/learn/strategies` | 12 | Long call through iron condor, iron butterfly, call ratio backspread and the jade lizard — each with a payoff diagram computed from the same leg/premium data as its stats panel (`lib/content/payoff.ts`), a worked numeric example, construction, ideal scenario and the mistakes that break it |
| `/learn/glossary` | 34 | Options basics, the Greeks, Indian F&O rules, market-reading terms — plus this project's own Aegis, Zenith, Quantum Horizon, COA Matrix, RRG Momentum, Zero-OTM Rule and DKMS Protocols, defined as first-class entries rather than left as unexplained jargon inside the terminal |
| `/learn/trading-styles` | 4 | Intraday, swing and positional options trading compared, plus the buying-vs-selling framing that cuts across all three |
| `/learn/indices` | 6 | NIFTY, BANKNIFTY, FINNIFTY (lot size and strike step read live from `INDEX_UNIVERSE`, the same constants the engine trades against) plus Midcap Nifty, Sensex and Bankex for reference |

Every strategy's payoff diagram, breakeven(s), max profit/loss and worked
example are derived from one leg definition per strategy — there is no second
place a number could drift out of sync with what the chart shows. A handful
of glossary terms (the Greeks, margin, max pain, PCR, breakeven) get their own
small illustrative chart rather than prose alone (`components/GreekGauge.tsx`,
`MarginStack.tsx`, `MaxPainCurve.tsx`, `PcrGauge.tsx`, `BreakevenLine.tsx`).

Every `/learn` page fires a Zaraz page-view event on mount via
`AnalyticsBeacon` (wired once through `LearnChrome`, not repeated per page) —
`learn_strategy_view`, `learn_glossary_view`, `learn_trading_style_view`,
`learn_index_view` and their `*_hub_view` counterparts, each carrying the
page's slug so content types can be segmented in Zaraz.

The old `/tools/expiry-calendar` page this section replaced 301-redirects to
`/learn` (`next.config.mjs`), preserving whatever link equity or indexing the
old URL had already picked up.

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
| **Redirect URL** | `https://<your-domain>/auth/callback`. DeltaK uses `loginByPassword`, not the OAuth publisher flow, so this is never exercised — but the form requires a valid URL, and the app serves a real page there. |
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

## Single active session

Angel One issues a fresh JWT on every `loginByPassword` call without
invalidating whichever one it handed out last, so two browser windows signed
in as the same client code would otherwise both keep trading until their
cookies separately expire. `client_sessions` closes that gap: one row per
client code holding whichever session id is current. Login overwrites it —
that overwrite *is* the sign-out of whatever window held the previous id.

- **`POST /api/auth/login`** mints a new session id, writes it to
  `client_sessions` (last write wins) and stamps it into the httpOnly cookie
  alongside the JWT.
- **`GET /api/auth/session`** — already polled every fifteen minutes and on
  tab focus (see The operator, above) — checks the cookie's session id
  against the row before anything else. A mismatch means a newer login
  happened elsewhere: this window's JWT is invalidated at the broker
  (best-effort), its cookie is cleared, and it comes back
  `{ authenticated: false, reason: "superseded" }`, which the HUD shows as
  "signed in from another window" rather than the generic expiry message.
- **`POST /api/order`** repeats the same check synchronously, so a superseded
  window can't place a live trade during the fifteen-minute gap before its
  next session poll — the one consequence of two open windows that can't wait
  out a polling interval.
- **`POST /api/auth/logout`** deletes the row on explicit sign-out.

Same posture as `broker_sessions`: RLS on, no policies, service-role key only.
It also **fails open** the same way persistence does — without
`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` configured there is nowhere to
record a session id, so every session is trivially "active" and this
enforcement is simply off.

## Mobile companion

A phone visiting `/terminal` never sees Angel One's client-code/PIN/TOTP
form — by construction, not by a hidden route. The page branches on user
agent (`lib/server/device.ts`) before anything else renders: a mobile UA gets
either a "scan this on your desktop" screen or, once paired, a read-only
companion; a desktop UA gets today's terminal, unchanged.

Pairing is a QR the phone's own camera app scans directly — there is no
in-app scanner and no camera permission this app ever asks for:

1. An already-signed-in desktop opens the user pill dropdown (top right),
   where a **Pair Mobile** section mints a QR the moment the dropdown opens —
   small by default, tap to expand within the dropdown itself, no separate
   modal. `POST /api/mobile/pair` mints a random, two-minute claim ticket in
   `mobile_pairings` and renders it server-side as an SVG QR (via `qrcode`,
   used only inside this one Node route handler — nothing about QR
   generation ships to the browser bundle) encoding
   `/api/mobile/pair/claim?token=…`.
2. The phone's camera opens that URL directly. `GET /api/mobile/pair/claim`
   is a route handler, not a page — claiming is a mutation (the ticket is
   deleted, single-use, atomically via `DELETE … RETURNING`), and only a
   route handler is guaranteed to run exactly once per actual visit, unlike
   a Server Component render that Next may prefetch. A valid ticket mints a
   `mobile_sessions` row and sets a long-lived, httpOnly `dk_mobile` cookie;
   either way it redirects to a clean `/terminal`.
3. From then on the phone reads two things, both through
   `GET /api/mobile/state`, and never anything else:
   - **`live_signals`** — the desktop tab's own signal/ledger snapshot,
     pushed on a five-second throttle from `useEngine.ts` via
     `POST /api/mobile/push` (gated by a plain session-cookie check, not the
     single-active-session lookup — this is a low-stakes mirror, not an
     order).
   - **`positions`** — the same table `/api/history` already reads, scoped to
     the paired account's client code — open positions and recent closed
     trades.

   `/api/mobile/state` never imports `lib/server/smartapi.ts`. The mobile
   companion cannot call Angel One even by accident, because nothing in its
   one route holds a JWT to call it with.

A phone can unpair itself (`POST /api/mobile/logout`, revokes its
`mobile_sessions` row) to force a fresh QR next time. Multiple phones may be
paired to one account at once — unlike `client_sessions`, this isn't a
single-active-session arbiter, just a read-only viewer.

Same posture as everything else here: RLS on, no policies, service-role key
only; fails open the same way — without Supabase configured, pairing simply
has nowhere to write and the desktop's Pair Mobile button surfaces that as
an ordinary request error.

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
engine that nothing in the serverless build ever read or wrote. `0004` adds
`broker_sessions` (the watchdog's encrypted credential store, below); `0005`
adds `positions.entry_spot`; `0010` adds `client_sessions` (single
active session, above).

## Autopilot

The header's Paper/Live toggle is gone for now — Live has no server-side home
yet (see Watchdog, below), so a toggle for a mode that wasn't really available
was its own kind of misleading. In its place: **Autopilot** vs **Manual**,
paper mode only, entirely local to the browser tab.

- **Manual** (default) — today's behaviour: an actionable signal waits in the
  Signal Deck until the operator clicks Execute.
- **Autopilot** — the same tick loop that already evaluates every signal
  also fires it: an actionable signal opens a paper position itself, through
  the exact same `executeSignal` path a manual click uses (same sizing, same
  portfolio-risk gate). It only ever opens the *first* position on a signal's
  token — once one is open, later ticks skip it, so a signal that stays
  actionable for minutes doesn't reopen every second. Nothing fires against a
  settled board; out of hours (and not simulated) there's no live price to
  fill against.

**Scale-out stays in the browser in both modes.** The Weakening-quadrant TP1
half-exit (`checkWeakeningRotation`) needs live RRG rotation state that only
exists inside a running tab — it isn't gated by Autopilot vs Manual, it just
always runs, the same as it always has.

DKMS itself already had a name for this idea — the Delta-protocol rationale
reads "auto-driver muted" when both bounds are migrating. Autopilot is that
same concept, given its own name in the header: the engine flying the trade
by itself, rather than muted the rest of the time.

## Watchdog

The trading loop above only runs in the browser: close the tab, and every
guard in `lib/engine/risk.ts` stops with it. `/api/watchdog/tick` is a second,
much narrower copy of two of those guards — stop/target and the 3:15 PM IST
Daylight Rest flatten — invoked once a minute independently of any open tab.

The trigger is **Supabase's `pg_cron` + `pg_net`**, not Vercel Cron: Vercel's
Hobby plan only allows once-a-day schedules (Pro allows once a minute), while
`pg_cron`/`pg_net` are plain Postgres extensions with the same once-a-minute
floor on every Supabase plan, free included. `supabase/migrations/0006-0008`
enable the extensions and schedule `cron.schedule('watchdog-tick', '* * * * *', …)`
to call the route via `net.http_get`. The bearer token it sends is read from
**Supabase Vault** by name (`watchdog_cron_secret`) at execution time — the
migration that schedules the job contains no secret, only a name; the secret
itself is created once, out of band, via `vault.create_secret(...)`, and must
hold the exact same value as `CRON_SECRET` below.

**Paper positions only.** `mode = 'live'` rows are never queried, and nothing
in this path can place a broker order — `lib/server/watchdogMarket.ts`
imports only Angel One's read endpoints (candles, OI, PCR, buildup, LTP), never
`placeOrder`. Live-mode automation is a deliberately separate, unbuilt
capability.

**Not covered yet:** Invalidation (needs the COA walls) and the
Weakening-quadrant scale-out (needs live RRG rotation) both need market state
that only exists inside a running browser tab's engine today. Closing that
gap needs a server-side home for that state, which is future work, not a
missing wire-up.

**Credentials.** The route needs a live price per open position, and every
SmartAPI call — even a read — requires a session JWT. That JWT is stored
**encrypted** (`broker_sessions`, AES-256-GCM, keyed by `DK_SESSION_ENC_KEY`)
whenever the browser's own httpOnly-cookie session is established or
revalidated (login, and every session check — not only when a token is
actually refreshed). Without `DK_SESSION_ENC_KEY` set, every function that
would write to this table is a no-op: the feature is off by construction, not
by a flag someone has to remember to check. The cron route itself is gated by
`CRON_SECRET` — checked against whatever `pg_net` sends as the bearer token,
which is the Vault secret above. Unset, or mismatched, the route refuses
everything.

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
| `GET` | `/api/watchdog/tick` | Cron-only (`CRON_SECRET`-gated). Enforces stop/target and the 3:15 PM Daylight Rest flatten on every account's open **paper** positions, using each account's stored session — the guard that runs with no browser tab open |
| `POST` | `/api/mobile/pair` | Mint a two-minute QR claim ticket for pairing a phone |
| `GET` | `/api/mobile/pair/claim` | What the QR encodes — a route handler, not a page, since claiming is a one-time mutation. Sets the long-lived `dk_mobile` cookie and redirects to `/terminal` |
| `GET` | `/api/mobile/state` | What a paired phone polls: the desktop's last-pushed signal mirror plus this account's positions — never touches Angel One |
| `POST` | `/api/mobile/push` | The desktop's throttled mirror of its own signal state, fire-and-forget |
| `POST` | `/api/mobile/logout` | Unpair this phone, revoking its session row |

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
      mobile/             pair (mint QR) · pair/claim (scan, mutates) · state
                          (poll) · push (desktop → mirror) · logout (unpair)
      watchdog/tick/      cron-only stop/target + Daylight Rest flatten
    learn/                static wiki — no login, nothing computed per-visitor
      strategies/[slug]/  12 strategies, payoff diagrams driven by lib/content
      glossary/[slug]/    34 terms, incl. this project's own vocabulary
      trading-styles/[slug]/  4 styles
      indices/[slug]/     6 indices
    page.tsx, layout.tsx  HUD shell
    not-found.tsx, sitemap.ts, robots.ts, llms.txt/  crawl surface
  components/            HUD panels (chain, RRG scatter, order book, signal panel)
                         plus the header user pill and mobile/ companion views
    LearnChrome.tsx, PayoffChart.tsx, GreekGauge.tsx, MaxPainCurve.tsx, …
                         /learn's shared chrome and its illustrative charts
  lib/
    content/             /learn's data — one leg/definition list per
                         strategy, glossary term, trading style and index;
                         payoff.ts computes every chart and stat from it
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
      mobile.ts          QR minting/claim, mobile session cookie
      crypto.ts          AES-256-GCM for the watchdog's stored broker session
      watchdogMarket.ts  read-only SmartAPI calls for the cron watchdog
    supabase.ts          Supabase client
    analytics.ts         Zaraz track()/setAnalyticsContext()
    useTurnstile.ts      the non-interactive challenge, browser side
    useEngine.ts         the engine loop itself — runs in the browser
    useMarketData.ts     historical context polling and ΔOI baselining
  tests/                 engine unit tests
supabase/migrations/     database schema
```
