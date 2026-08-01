-- Delta-K Terminal — persist the entry spot on a position.
--
-- The Weakening-quadrant TP1 scale-out now requires a corroborating adverse
-- move in the underlying since entry (lib/engine/risk.ts, weakeningCorroborated)
-- rather than trusting the RRG quadrant alone, which a deep-ITM position's
-- theta bleed can drift into on a flat tape. That check needs the spot at
-- entry, which until now only ever lived in browser memory — a server-side
-- guard reading positions back from this table had no way to run it.

alter table public.positions
  add column if not exists entry_spot numeric;

comment on column public.positions.entry_spot is
  'Index spot at entry. Lets a risk guard tell a real move in the underlying
   from option-premium theta drift when deciding whether a Weakening rotation
   is genuine.';
