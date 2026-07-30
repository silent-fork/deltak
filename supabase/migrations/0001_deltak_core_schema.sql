-- Delta-K Terminal — persistence schema (applied to project `DeltaK`).
--
-- The FastAPI engine is the sole writer and connects with the service-role key,
-- which bypasses RLS. RLS is therefore enabled with *no* permissive policies:
-- anon and authenticated clients get nothing, which is the correct default for a
-- server-owned trading ledger. Read access for the HUD goes through the engine's
-- own /api/history/* endpoints.

create table if not exists public.trading_sessions (
  id                uuid primary key default gen_random_uuid(),
  started_at        timestamptz not null default now(),
  ended_at          timestamptz,
  mode              text not null check (mode in ('paper', 'live')),
  starting_capital  numeric(18, 2) not null default 0,
  client_code       text,
  engine_version    text,
  notes             text
);

comment on table public.trading_sessions is
  'One row per engine boot. Never stores SmartAPI credentials or tokens.';

create table if not exists public.orders (
  id                bigint generated always as identity primary key,
  session_id        uuid references public.trading_sessions(id) on delete cascade,
  created_at        timestamptz not null default now(),
  mode              text not null check (mode in ('paper', 'live')),
  underlying        text not null,
  token             text not null,
  trading_symbol    text not null,
  transaction_type  text not null check (transaction_type in ('BUY', 'SELL')),
  order_type        text not null default 'MARKET',
  quantity          integer not null check (quantity > 0),
  lots              integer,
  lot_size          integer,
  price             numeric(14, 2),
  fill_price        numeric(14, 2),
  status            text not null check (status in ('ACCEPTED', 'REJECTED')),
  broker_order_id   text,
  ledger_id         text,
  protocol          text check (protocol in ('ALPHA', 'BETA', 'GAMMA', 'DELTA')),
  option_type       text check (option_type in ('CE', 'PE')),
  strike            numeric(14, 2),
  message           text
);

create index if not exists orders_session_created_idx
  on public.orders (session_id, created_at desc);
create index if not exists orders_underlying_idx
  on public.orders (underlying, created_at desc);

create table if not exists public.positions (
  id                bigint generated always as identity primary key,
  session_id        uuid references public.trading_sessions(id) on delete cascade,
  ledger_id         text not null,
  mode              text not null check (mode in ('paper', 'live')),
  underlying        text not null,
  token             text not null,
  trading_symbol    text not null,
  option_type       text check (option_type in ('CE', 'PE')),
  strike            numeric(14, 2),
  side              text not null check (side in ('BUY', 'SELL')),
  quantity          integer not null,
  lots              integer not null,
  lot_size          integer not null,
  avg_price         numeric(14, 2) not null,
  ltp               numeric(14, 2),
  stop_loss         numeric(14, 2),
  target            numeric(14, 2),
  protocol          text check (protocol in ('ALPHA', 'BETA', 'GAMMA', 'DELTA')),
  status            text not null default 'OPEN' check (status in ('OPEN', 'CLOSED')),
  unrealised_pnl    numeric(18, 2) not null default 0,
  realised_pnl      numeric(18, 2) not null default 0,
  exit_price        numeric(14, 2),
  exit_reason       text,
  opened_at         timestamptz not null default now(),
  closed_at         timestamptz,
  updated_at        timestamptz not null default now(),
  unique (session_id, ledger_id)
);

create index if not exists positions_status_idx
  on public.positions (status, opened_at desc);
create index if not exists positions_underlying_idx
  on public.positions (underlying, opened_at desc);

create table if not exists public.risk_events (
  id          bigint generated always as identity primary key,
  session_id  uuid references public.trading_sessions(id) on delete cascade,
  ts          timestamptz not null default now(),
  kind        text not null check (
                kind in ('INVALIDATION', 'DAYLIGHT_REST', 'STOP_LOSS',
                         'TARGET', 'PANIC', 'INFO')),
  underlying  text,
  message     text not null
);

create index if not exists risk_events_ts_idx on public.risk_events (ts desc);
create index if not exists risk_events_kind_idx on public.risk_events (kind, ts desc);

-- Signal audit trail: one row per *state change*, not per tick, so the table
-- stays small enough to review a whole session by eye.
create table if not exists public.signals (
  id              bigint generated always as identity primary key,
  session_id      uuid references public.trading_sessions(id) on delete cascade,
  captured_at     timestamptz not null default now(),
  underlying      text not null,
  protocol        text not null check (protocol in ('ALPHA', 'BETA', 'GAMMA', 'DELTA')),
  actionable      boolean not null default false,
  blocked_reason  text,
  trading_symbol  text,
  option_type     text check (option_type in ('CE', 'PE')),
  strike          numeric(14, 2),
  itm_depth       integer,
  entry_price     numeric(14, 2),
  stop_loss       numeric(14, 2),
  target_1        numeric(14, 2),
  quadrant        text check (quadrant in ('LEADING', 'IMPROVING', 'WEAKENING', 'LAGGING')),
  lots            integer,
  spot            numeric(14, 2),
  aegis_1         numeric(14, 2),
  zenith_1        numeric(14, 2),
  pcr             numeric(10, 3)
);

create index if not exists signals_underlying_idx
  on public.signals (underlying, captured_at desc);

create table if not exists public.engine_settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now()
);

-- Session P&L rollup for the review screen.
create or replace view public.session_performance as
select
  p.session_id,
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
group by p.session_id, p.mode, p.underlying;

-- A SECURITY DEFINER view would run with the creator's rights and hand the
-- whole ledger to any anon caller, bypassing RLS. security_invoker makes the
-- view honour the caller's permissions instead.
alter view public.session_performance set (security_invoker = true);

alter table public.trading_sessions enable row level security;
alter table public.orders           enable row level security;
alter table public.positions        enable row level security;
alter table public.risk_events      enable row level security;
alter table public.signals          enable row level security;
alter table public.engine_settings  enable row level security;
