-- Delta-K Terminal — single active session per client code.
--
-- Angel One issues a fresh JWT on every `loginByPassword` call without
-- invalidating whichever one it handed out last, so two browser windows
-- signed in as the same client code both keep trading until their cookies
-- separately expire. This table is the arbiter: one row per client code
-- holding whichever session id is current. Login overwrites it — that
-- overwrite *is* the sign-out of whatever window held the previous id, which
-- discovers the mismatch on its own next `/api/auth/session` check (or
-- immediately, if it tries to place a live order) and signs itself out.
--
-- Same posture as every other table here: RLS on, no policies. The
-- service-role key — server-side only — is the sole reader and writer.

create table if not exists public.client_sessions (
  client_code text primary key,
  session_id  text not null,
  updated_at  timestamptz not null default now()
);

comment on table public.client_sessions is
  'One row per Angel One client code, holding the session id of whichever
   browser window most recently signed in. Every login overwrites it; any
   other window still holding an older id is the one that gets signed out on
   its next session check. Enforces single-active-session, independent of
   Angel One''s own token lifetime.';

alter table public.client_sessions enable row level security;
