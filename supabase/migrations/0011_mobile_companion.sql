-- Delta-K Terminal — read-only mobile companion, paired by QR, no Angel One
-- login on the phone, ever.
--
-- Three tables, three narrow jobs:
--
--  `mobile_pairings` — a one-time, short-lived claim ticket. The desktop
--  terminal (already signed in) mints one; the phone's own camera app reads
--  the QR and opens the claim URL directly, no in-app scanner involved. A
--  row is deleted the moment it's claimed (or once expired), so this table
--  never holds anything but a handful of pending pairings.
--
--  `mobile_sessions` — the phone's own session, once paired. Holds a
--  client code and nothing else: no JWT, no broker token, because the
--  mobile companion never calls Angel One and never could — the routes it
--  reads from don't import the SmartAPI client at all.
--
--  `live_signals` — one row per client code, the desktop engine's current
--  signal snapshot (which protocol is armed, per underlying) pushed on a
--  throttle so the phone has something to show between position
--  checkpoints. Overwritten every push; history isn't the point, `positions`
--  and `orders` already are the record of what actually happened.
--
-- Same posture as every other table here: RLS on, no policies. The
-- service-role key — server-side only — is the sole reader and writer.

create table if not exists public.mobile_pairings (
  token       text primary key,
  client_code text not null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null
);

comment on table public.mobile_pairings is
  'One-time QR claim tickets. A row is deleted the instant it is claimed (or
   superseded by a freshly generated one for the same client code) — nothing
   here is meant to outlive its own two-minute window.';

alter table public.mobile_pairings enable row level security;

create table if not exists public.mobile_sessions (
  session_id   text primary key,
  client_code  text not null,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at   timestamptz
);

comment on table public.mobile_sessions is
  'One row per paired phone. Holds a client code only — no token of any
   kind, because the mobile companion is read-only by construction and never
   has anything from Angel One to hold.';

alter table public.mobile_sessions enable row level security;

create index if not exists mobile_sessions_client_idx
  on public.mobile_sessions (client_code);

create table if not exists public.live_signals (
  client_code text primary key,
  snapshot    jsonb not null,
  updated_at  timestamptz not null default now()
);

comment on table public.live_signals is
  'The desktop engine''s current signal snapshot (per-underlying protocol,
   armed candidate, ledger PnL), pushed on a throttle so the mobile
   companion has something live to show. Overwritten every push — this is a
   mirror of in-tab state, not a record; `positions`/`orders` are the
   record.';

alter table public.live_signals enable row level security;
