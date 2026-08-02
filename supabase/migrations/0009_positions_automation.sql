-- Delta-K Terminal — record who opened a position.
--
-- Autopilot (lib/useEngine.ts, the Autopilot effect) and a manual Execute
-- click (components/SignalPanel.tsx) both funnel into the same
-- `executeSignal`, and until now the resulting position carried no trace of
-- which one fired it — the Trade Book showed an auto-entered position
-- identically to a manual one. Existing rows predate the distinction and are
-- backfilled as 'manual', since that was the only way a position could have
-- opened before Autopilot existed.

alter table public.positions
  add column if not exists automation text not null default 'manual'
    check (automation in ('auto', 'manual'));

comment on column public.positions.automation is
  'Who opened the position — Autopilot firing an actionable signal on its own,
   or an operator clicking Execute.';
