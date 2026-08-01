-- Delta-K Terminal — drop the tables nothing ever wrote to.
--
-- 0001 laid out a schema for the FastAPI engine that used to own persistence.
-- The engine now runs in the browser and writes three things: risk events,
-- positions and orders. The rest were carried forward and never connected to
-- anything — each held zero rows at the time of this migration:
--
--   trading_sessions   one row per engine boot; the browser engine has no boot
--                      record to write, and `positions.session_id` was never
--                      populated, so the FK anchored nothing
--   signals            a per-state-change audit trail with no writer
--   engine_settings    a runtime settings store; `EngineConfig` is a constant
--                      in `lib/engine/config.ts` instead
--   session_performance  a rollup view over `positions` with no reader
--
-- Trades are attributed by `client_code` and deduplicated by `trade_key`
-- (0002), neither of which needs a session row.

drop view if exists public.session_performance;

drop table if exists public.signals;
drop table if exists public.engine_settings;

-- The FK constraints go with the parent table; the orphaned columns do not, so
-- they are named explicitly rather than left behind as always-null clutter.
alter table public.positions   drop column if exists session_id;
alter table public.orders      drop column if exists session_id;
alter table public.risk_events drop column if exists session_id;

drop table if exists public.trading_sessions;

-- Dropping `session_id` takes the composite unique with it. `trade_key` is the
-- upsert target now, and 0002 already indexes it.
drop index if exists public.orders_session_created_idx;
