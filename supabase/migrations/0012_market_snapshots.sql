-- Delta-K Terminal — closed-market board hydration.
--
-- One row per underlying (NIFTY/BANKNIFTY/FINNIFTY/BANKEX/SENSEX), holding
-- whatever the board last had available for that underlying — spot, session
-- stats, candles, per-strike OI/volume/LTP legs, cumulative PCR, futures OI
-- buildup — as a single JSON blob. Global, not per client code: the data
-- describes the market, not an account, and every signed-in operator should
-- see the same last-known board on login rather than each re-fetching (and
-- re-hammering Angel One and NSE) independently.
--
-- Written on two events only, both client-driven: the market closing while
-- a session is open, and the operator switching focus to a different
-- underlying while it's still closed. Read once, on login/boot, while the
-- market is closed — if the stored row is fresh enough, it hydrates the
-- board with no fetch at all; if it's missing or stale, the existing
-- Angel One / NSE fetch path runs exactly as it does today and its result
-- becomes the new row.
--
-- Same posture as every other table here: RLS on, no policies. The
-- service-role key — server-side only — is the sole reader and writer.

create table if not exists public.market_snapshots (
  underlying   text primary key,
  session_date text not null,
  snapshot     jsonb not null,
  updated_at   timestamptz not null default now()
);

comment on table public.market_snapshots is
  'One row per underlying — the board''s last-available data (spot, session
   stats, candles, per-strike OI/volume/LTP legs, PCR, OI buildup) while the
   market is closed. Overwritten on close and on each focus switch while
   closed; this is a mirror of in-tab state, not a record.';

alter table public.market_snapshots enable row level security;
