-- V3.9.11 hotfix: align the database lock-key contract with the deployed
-- commons-precision-v2 Edge Function. Keep v1 accepted for rollback safety.
create or replace function public.tc_acquire_commons_precision_cache_lock(
  requested_key text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  observed_at timestamptz := now();
  acquired boolean := false;
begin
  if requested_key !~ '^lock:commons-precision-v[12]:[A-Fa-f0-9]{64}$' then return false; end if;
  perform pg_advisory_xact_lock(hashtext(requested_key));
  delete from public.commons_precision_cache where cache_key = requested_key and expires_at <= observed_at;
  if exists (select 1 from public.commons_precision_cache where cache_key = requested_key and expires_at > observed_at) then
    return false;
  end if;
  insert into public.commons_precision_cache (cache_key, cache_kind, payload, payload_bytes, created_at, expires_at)
  values (requested_key, 'in-progress-lock', '{}'::jsonb, 2, observed_at, observed_at + interval '25 seconds');
  acquired := true;
  return acquired;
end;
$$;
