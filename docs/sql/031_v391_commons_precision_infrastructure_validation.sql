begin;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'commons_precision_cache',
    'commons_precision_quota_state',
    'commons_precision_upstream_lock',
    'commons_precision_usage_daily'
  ] loop
    if not exists (
      select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name and c.relrowsecurity
    ) then
      raise exception 'RLS is not enabled for public.%', table_name;
    end if;

    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT') then
      raise exception 'client role can read public.%', table_name;
    end if;
  end loop;
end
$$;

set local role service_role;

do $$
declare
  attempt integer;
begin
  for attempt in 1..20 loop
    if not public.tc_claim_commons_precision_upstream_slot(20, 900) then
      raise exception 'quota claim % unexpectedly failed', attempt;
    end if;
  end loop;
  if public.tc_claim_commons_precision_upstream_slot(20, 900) then
    raise exception 'minute quota allowed request 21';
  end if;
end
$$;

do $$
declare
  first_token uuid := '11111111-1111-4111-8111-111111111111';
  second_token uuid := '22222222-2222-4222-8222-222222222222';
begin
  if not public.tc_acquire_commons_precision_upstream_lock(first_token) then
    raise exception 'first upstream lock was not acquired';
  end if;
  if public.tc_acquire_commons_precision_upstream_lock(second_token) then
    raise exception 'second upstream lock was acquired concurrently';
  end if;
  if public.tc_release_commons_precision_upstream_lock(second_token) then
    raise exception 'wrong token released upstream lock';
  end if;
  if not public.tc_release_commons_precision_upstream_lock(first_token) then
    raise exception 'owner token did not release upstream lock';
  end if;
end
$$;

do $$
declare
  candidate_key text := 'candidate:commons-precision-v1:' || repeat('a', 64);
  lock_key text := 'lock:commons-precision-v1:' || repeat('b', 64);
begin
  if not public.tc_put_commons_precision_cache(
    candidate_key,
    'candidate-results',
    '{"state":"results"}'::jsonb,
    now() + interval '10 minutes'
  ) then
    raise exception 'valid candidate cache write failed';
  end if;

  if public.tc_put_commons_precision_cache(
    'candidate:commons-precision-v1:' || repeat('c', 64),
    'candidate-results',
    jsonb_build_object('payload', repeat('x', 65536)),
    now() + interval '10 minutes'
  ) then
    raise exception 'oversized cache payload was accepted';
  end if;

  if not public.tc_acquire_commons_precision_cache_lock(lock_key) then
    raise exception 'first operation lock was not acquired';
  end if;
  if public.tc_acquire_commons_precision_cache_lock(lock_key) then
    raise exception 'duplicate operation lock was acquired';
  end if;
  if not public.tc_release_commons_precision_cache_lock(lock_key) then
    raise exception 'operation lock was not released';
  end if;
end
$$;

do $$
declare
  today_taipei date := timezone('Asia/Taipei', now())::date;
  usage_delta jsonb := '{
    "precisionSearches":1,"upstreamRequests":2,"entityCacheHits":3,
    "candidateCacheHits":4,"noSuitableCacheHits":5,"successfulSearches":6,
    "allFilteredSearches":7,"noSuitableSearches":8,"projectQuotaReached":9,
    "timeoutCount":10,"rateLimited429":11,"upstreamError503":12,
    "latencyUnder2s":13,"latency2To5s":14,"latency5To20s":15
  }'::jsonb;
begin
  if not public.tc_add_commons_precision_usage(today_taipei, usage_delta)
    or not public.tc_add_commons_precision_usage(today_taipei, usage_delta) then
    raise exception 'valid usage delta failed';
  end if;

  if (select upstream_requests from public.commons_precision_usage_daily where usage_date = today_taipei) <> 4 then
    raise exception 'usage delta was not merged atomically';
  end if;

  if public.tc_add_commons_precision_usage(today_taipei, usage_delta || '{"query":"secret"}'::jsonb) then
    raise exception 'unknown or sensitive usage field was accepted';
  end if;

  insert into public.commons_precision_usage_daily (usage_date)
  values ((date_trunc('month', today_taipei)::date - interval '14 months')::date);
  perform public.tc_add_commons_precision_usage(today_taipei, usage_delta);
  if exists (
    select 1 from public.commons_precision_usage_daily
    where usage_date < (date_trunc('month', today_taipei)::date - interval '13 months')::date
  ) then
    raise exception 'expired daily usage row was not removed';
  end if;
end
$$;

reset role;

do $$
begin
  if has_function_privilege('anon', 'public.tc_add_commons_precision_usage(date,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.tc_add_commons_precision_usage(date,jsonb)', 'EXECUTE') then
    raise exception 'client role can execute server-only usage RPC';
  end if;
  if not has_function_privilege('service_role', 'public.tc_add_commons_precision_usage(date,jsonb)', 'EXECUTE') then
    raise exception 'service role cannot execute usage RPC';
  end if;
  if not has_table_privilege('service_role', 'public.commons_precision_cache', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'service role lacks required cache privileges';
  end if;
end
$$;

rollback;
