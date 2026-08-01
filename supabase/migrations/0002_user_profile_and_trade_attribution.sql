-- Delta-K Terminal — operator profile, and trades that belong to someone.
--
-- Two gaps this closes:
--
--  1. The terminal knew a client code and nothing else. `getProfile` is called
--     on every session check already (it is the cheapest proof the JWT is
--     alive); its answer was thrown away. It is now kept here, so the HUD can
--     name the operator and the ledger can be read back per account.
--
--  2. `positions` and `orders` had no owner column, so a multi-account ledger
--     was indistinguishable from one account's. Every trade now carries the
--     client code it was taken under.
--
-- Same posture as 0001: RLS on, no policies. The service-role key — server-side
-- only — is the sole writer, and reads go through the app's own routes.

create table if not exists public.user_profiles (
  client_code     text primary key,
  name            text,
  email           text,
  mobile_no       text,
  broker          text,
  -- Angel One returns these as arrays of segment/product codes.
  exchanges       text[] not null default '{}',
  products        text[] not null default '{}',
  -- The broker's own view of the last login, which is not the same as the last
  -- time this terminal saw the account: a login elsewhere moves it.
  broker_last_login text,
  first_seen_at   timestamptz not null default now(),
  last_login_at   timestamptz,
  last_seen_at    timestamptz not null default now(),
  logins          integer not null default 0,
  updated_at      timestamptz not null default now()
);

comment on table public.user_profiles is
  'One row per Angel One client code. Identity only — never a token, PIN or TOTP.';

alter table public.user_profiles enable row level security;

/* ------------------------------------------------- trade attribution */

alter table public.trading_sessions
  add column if not exists user_agent text;

alter table public.positions
  add column if not exists client_code text,
  -- Ledger ids restart at DK-hhmmss-001 in every browser tab, so they identify
  -- a position only within one boot. The trade key is what makes a
  -- mark-to-market checkpoint of the *same* position collapse onto one row
  -- instead of appending a new one every minute.
  add column if not exists trade_key text,
  add column if not exists pnl_pct numeric(10, 2);

alter table public.orders
  add column if not exists client_code text;

-- Not a partial index: `on conflict (trade_key)` cannot infer a partial one
-- without repeating its predicate, which PostgREST does not emit. Nulls are
-- distinct in a plain unique index, so rows written before this migration —
-- which have no trade key — coexist with it.
create unique index if not exists positions_trade_key_key
  on public.positions (trade_key);

create index if not exists positions_client_status_idx
  on public.positions (client_code, status, opened_at desc);
create index if not exists orders_client_idx
  on public.orders (client_code, created_at desc);

-- Keep `updated_at` honest on upsert without every writer having to remember.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists positions_touch_updated_at on public.positions;
create trigger positions_touch_updated_at
  before update on public.positions
  for each row execute function public.touch_updated_at();

drop trigger if exists user_profiles_touch_updated_at on public.user_profiles;
create trigger user_profiles_touch_updated_at
  before update on public.user_profiles
  for each row execute function public.touch_updated_at();

/* ------------------------------------------------------- rollup view */

-- Recreated to group by account as well as session: with several client codes
-- in one table, a session-only rollup silently merges two operators' books.
-- Dropped rather than replaced — `create or replace view` cannot insert a
-- column into the middle of an existing one's output.
drop view if exists public.session_performance;

create view public.session_performance as
select
  p.session_id,
  p.client_code,
  p.mode,
  p.underlying,
  count(*)                                              as trades,
  count(*) filter (where p.realised_pnl > 0)            as wins,
  count(*) filter (where p.realised_pnl < 0)            as losses,
  round(sum(p.realised_pnl), 2)                         as realised_pnl,
  round(avg(p.realised_pnl), 2)                         as avg_pnl,
  max(p.realised_pnl)                                   as best,
  min(p.realised_pnl)                                   as worst
from public.positions p
where p.status = 'CLOSED'
group by p.session_id, p.client_code, p.mode, p.underlying;

alter view public.session_performance set (security_invoker = true);
