-- pg_net rejects ALTER EXTENSION ... SET SCHEMA, so moving it out of public
-- (Supabase's own linter recommendation) means drop and recreate — safe here,
-- the request queue was empty and net.http_get/http_post are recreated
-- identically, just registered under `extensions` instead of `public`.
drop extension if exists pg_net;
create extension if not exists pg_net with schema extensions;
