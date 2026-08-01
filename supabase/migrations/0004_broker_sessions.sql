-- Delta-K Terminal — encrypted Angel One session, for background jobs.
--
-- The browser's httpOnly cookie remains the only thing page JavaScript can
-- ever act through; this table is a second, independent copy of the same
-- session, written wherever the cookie already is (login, session-refresh),
-- so a background risk watchdog can read market data or manage positions
-- without a browser tab open. Every token column is AES-256-GCM ciphertext —
-- encryption and decryption happen only in `lib/server/crypto.ts`, keyed by
-- `DK_SESSION_ENC_KEY`, which lives only in the server environment.
--
-- Same posture as every other table here: RLS on, no policies. The
-- service-role key — server-side only — is the sole reader and writer.

create table if not exists public.broker_sessions (
  client_code        text primary key,
  jwt_ciphertext      text not null,
  jwt_iv              text not null,
  jwt_tag             text not null,
  refresh_ciphertext  text,
  refresh_iv          text,
  refresh_tag         text,
  -- Set to the next midnight IST at write time — SmartAPI sessions expire
  -- then regardless of when within the day they were issued, or sooner if a
  -- relogin overwrites this row first.
  expires_at          timestamptz not null,
  updated_at          timestamptz not null default now()
);

comment on table public.broker_sessions is
  'One encrypted Angel One session per client code, for background jobs (the
   risk watchdog) that need to read market data or manage positions without a
   browser tab open. Holds no plaintext token — every token column is
   AES-256-GCM ciphertext, decrypted only server-side. Expires at midnight IST
   or is overwritten on relogin.';

alter table public.broker_sessions enable row level security;
