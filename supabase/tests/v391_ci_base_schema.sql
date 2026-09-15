-- CI/local-only baseline for the isolated V3.9.1 Commons precision migration.
-- Supabase supplies auth, storage, API roles and extensions before migrations run.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
