-- Travel Companion V3.9.1 Commons precision search infrastructure.
-- Server-only cache, global quota/lock and privacy-preserving daily aggregates.

begin;

create table public.commons_precision_cache (
  cache_key text primary key,
  cache_kind text not null,
  payload jsonb not null default '{}'::jsonb,
  payload_bytes integer not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint commons_precision_cache_key_check check (
    length(cache_key) between 20 and 300
    and cache_key ~ '^(entity|candidate|no-suitable|lock):commons-precision-v1:[A-Za-z0-9:._-]+$'
  ),
  constraint commons_precision_cache_kind_check check (
    cache_kind in ('entity-evidence', 'candidate-results', 'no-suitable-image', 'in-progress-lock')
  ),
  constraint commons_precision_cache_payload_check check (
    jsonb_typeof(payload) = 'object'
    and payload_bytes = octet_length(convert_to(payload::text, 'UTF8'))
    and payload_bytes between 2 and 65536
  ),
  constraint commons_precision_cache_expiry_check check (
    expires_at > created_at
    and expires_at <= created_at + case cache_kind
      when 'entity-evidence' then interval '7 days'
      when 'in-progress-lock' then interval '25 seconds'
      else interval '10 minutes'
    end
  )
);

create index commons_precision_cache_expiry_idx
on public.commons_precision_cache (expires_at);

alter table public.commons_precision_cache enable row level security;
revoke all on table public.commons_precision_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.commons_precision_cache to service_role;

create table public.commons_precision_quota_state (
  singleton boolean primary key default true check (singleton),
  minute_started_at timestamptz not null default now(),
  minute_requests integer not null default 0 check (minute_requests between 0 and 20),
  taipei_date date not null default timezone('Asia/Taipei', now())::date,
  daily_requests integer not null default 0 check (daily_requests between 0 and 900),
  updated_at timestamptz not null default now()
);

insert into public.commons_precision_quota_state (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.commons_precision_quota_state enable row level security;
revoke all on table public.commons_precision_quota_state from public, anon, authenticated;
grant select, insert, update on table public.commons_precision_quota_state to service_role;

create table public.commons_precision_upstream_lock (
  singleton boolean primary key default true check (singleton),
  lock_token uuid,
  acquired_at timestamptz,
  expires_at timestamptz,
  constraint commons_precision_upstream_lock_shape_check check (
    (lock_token is null and acquired_at is null and expires_at is null)
    or (lock_token is not null and acquired_at is not null and expires_at = acquired_at + interval '25 seconds')
  )
);

insert into public.commons_precision_upstream_lock (singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.commons_precision_upstream_lock enable row level security;
revoke all on table public.commons_precision_upstream_lock from public, anon, authenticated;
grant select, insert, update on table public.commons_precision_upstream_lock to service_role;

create table public.commons_precision_usage_daily (
  usage_date date primary key,
  precision_searches bigint not null default 0 check (precision_searches >= 0),
  upstream_requests bigint not null default 0 check (upstream_requests >= 0),
  entity_cache_hits bigint not null default 0 check (entity_cache_hits >= 0),
  candidate_cache_hits bigint not null default 0 check (candidate_cache_hits >= 0),
  no_suitable_cache_hits bigint not null default 0 check (no_suitable_cache_hits >= 0),
  successful_searches bigint not null default 0 check (successful_searches >= 0),
  all_filtered_searches bigint not null default 0 check (all_filtered_searches >= 0),
  no_suitable_searches bigint not null default 0 check (no_suitable_searches >= 0),
  project_quota_reached bigint not null default 0 check (project_quota_reached >= 0),
  timeout_count bigint not null default 0 check (timeout_count >= 0),
  rate_limited_429 bigint not null default 0 check (rate_limited_429 >= 0),
  upstream_error_503 bigint not null default 0 check (upstream_error_503 >= 0),
  latency_under_2s bigint not null default 0 check (latency_under_2s >= 0),
  latency_2_to_5s bigint not null default 0 check (latency_2_to_5s >= 0),
  latency_5_to_20s bigint not null default 0 check (latency_5_to_20s >= 0),
  updated_at timestamptz not null default now()
);

alter table public.commons_precision_usage_daily enable row level security;
revoke all on table public.commons_precision_usage_daily from public, anon, authenticated;
grant select, insert, update, delete on table public.commons_precision_usage_daily to service_role;

create or replace function public.tc_claim_commons_precision_upstream_slot(
  maximum_per_minute integer default 20,
  maximum_per_day integer default 900
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed boolean := false;
  observed_at timestamptz := now();
  current_taipei_date date := timezone('Asia/Taipei', observed_at)::date;
begin
  if maximum_per_minute < 1 or maximum_per_minute > 20 or maximum_per_day < 1 or maximum_per_day > 900 then
    return false;
  end if;

  update public.commons_precision_quota_state
  set minute_started_at = case when observed_at - minute_started_at >= interval '1 minute' then observed_at else minute_started_at end,
      minute_requests = case when observed_at - minute_started_at >= interval '1 minute' then 1 else minute_requests + 1 end,
      taipei_date = current_taipei_date,
      daily_requests = case when taipei_date <> current_taipei_date then 1 else daily_requests + 1 end,
      updated_at = observed_at
  where singleton
    and (observed_at - minute_started_at >= interval '1 minute' or minute_requests < maximum_per_minute)
    and (taipei_date <> current_taipei_date or daily_requests < maximum_per_day)
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function public.tc_acquire_commons_precision_upstream_lock(
  requested_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  acquired boolean := false;
  observed_at timestamptz := now();
begin
  if requested_token is null then return false; end if;
  update public.commons_precision_upstream_lock
  set lock_token = requested_token,
      acquired_at = observed_at,
      expires_at = observed_at + interval '25 seconds'
  where singleton and (lock_token is null or expires_at <= observed_at)
  returning true into acquired;
  return coalesce(acquired, false);
end;
$$;

create or replace function public.tc_release_commons_precision_upstream_lock(
  requested_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  released boolean := false;
begin
  update public.commons_precision_upstream_lock
  set lock_token = null, acquired_at = null, expires_at = null
  where singleton and lock_token = requested_token
  returning true into released;
  return coalesce(released, false);
end;
$$;

create or replace function public.tc_put_commons_precision_cache(
  requested_key text,
  requested_kind text,
  requested_payload jsonb,
  requested_expires_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  observed_at timestamptz := now();
  requested_bytes integer := octet_length(convert_to(requested_payload::text, 'UTF8'));
  active_rows bigint;
  total_bytes bigint;
  candidate_bytes bigint;
  evidence_bytes bigint;
begin
  if requested_kind not in ('entity-evidence', 'candidate-results', 'no-suitable-image')
    or requested_bytes > 65536
    or requested_expires_at <= observed_at
    or requested_expires_at > observed_at + (
      case requested_kind when 'entity-evidence' then interval '7 days' else interval '10 minutes' end
    ) then
    return false;
  end if;

  perform pg_advisory_xact_lock(hashtext('travel-companion:commons-precision-cache'));
  delete from public.commons_precision_cache
  where ctid in (
    select ctid from public.commons_precision_cache where expires_at <= observed_at order by expires_at limit 100
  );

  select count(*), coalesce(sum(payload_bytes), 0),
    coalesce(sum(payload_bytes) filter (where cache_kind in ('candidate-results', 'no-suitable-image')), 0),
    coalesce(sum(payload_bytes) filter (where cache_kind = 'entity-evidence'), 0)
  into active_rows, total_bytes, candidate_bytes, evidence_bytes
  from public.commons_precision_cache
  where cache_key <> requested_key and expires_at > observed_at and cache_kind <> 'in-progress-lock';

  if active_rows >= 5000 or total_bytes + requested_bytes > 10485760
    or (requested_kind = 'entity-evidence' and evidence_bytes + requested_bytes > 2097152)
    or (requested_kind <> 'entity-evidence' and candidate_bytes + requested_bytes > 8388608) then
    return false;
  end if;

  insert into public.commons_precision_cache (cache_key, cache_kind, payload, payload_bytes, created_at, expires_at)
  values (requested_key, requested_kind, requested_payload, requested_bytes, observed_at, requested_expires_at)
  on conflict (cache_key) do update
  set cache_kind = excluded.cache_kind, payload = excluded.payload, payload_bytes = excluded.payload_bytes,
      created_at = excluded.created_at, expires_at = excluded.expires_at;
  return true;
end;
$$;

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
  if requested_key !~ '^lock:commons-precision-v1:[A-Fa-f0-9]{64}$' then return false; end if;
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

create or replace function public.tc_release_commons_precision_cache_lock(
  requested_key text
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from public.commons_precision_cache where cache_key = requested_key and cache_kind = 'in-progress-lock';
  return found;
end;
$$;

create or replace function public.tc_add_commons_precision_usage(
  requested_date date,
  delta jsonb
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_taipei_date date := timezone('Asia/Taipei', now())::date;
  allowed_keys text[] := array[
    'precisionSearches', 'upstreamRequests', 'entityCacheHits', 'candidateCacheHits', 'noSuitableCacheHits',
    'successfulSearches', 'allFilteredSearches', 'noSuitableSearches', 'projectQuotaReached', 'timeoutCount',
    'rateLimited429', 'upstreamError503', 'latencyUnder2s', 'latency2To5s', 'latency5To20s'
  ];
  key_name text;
begin
  if requested_date <> current_taipei_date or jsonb_typeof(delta) <> 'object' then return false; end if;
  foreach key_name in array allowed_keys loop
    if not (delta ? key_name) or jsonb_typeof(delta -> key_name) <> 'number' or (delta ->> key_name) !~ '^\d+$' then
      return false;
    end if;
  end loop;
  if exists (select 1 from jsonb_object_keys(delta) as supplied(key) where not supplied.key = any(allowed_keys)) then
    return false;
  end if;

  insert into public.commons_precision_usage_daily as usage (
    usage_date, precision_searches, upstream_requests, entity_cache_hits, candidate_cache_hits,
    no_suitable_cache_hits, successful_searches, all_filtered_searches, no_suitable_searches,
    project_quota_reached, timeout_count, rate_limited_429, upstream_error_503,
    latency_under_2s, latency_2_to_5s, latency_5_to_20s, updated_at
  ) values (
    requested_date, (delta->>'precisionSearches')::bigint, (delta->>'upstreamRequests')::bigint,
    (delta->>'entityCacheHits')::bigint, (delta->>'candidateCacheHits')::bigint,
    (delta->>'noSuitableCacheHits')::bigint, (delta->>'successfulSearches')::bigint,
    (delta->>'allFilteredSearches')::bigint, (delta->>'noSuitableSearches')::bigint,
    (delta->>'projectQuotaReached')::bigint, (delta->>'timeoutCount')::bigint,
    (delta->>'rateLimited429')::bigint, (delta->>'upstreamError503')::bigint,
    (delta->>'latencyUnder2s')::bigint, (delta->>'latency2To5s')::bigint,
    (delta->>'latency5To20s')::bigint, now()
  ) on conflict (usage_date) do update set
    precision_searches = usage.precision_searches + excluded.precision_searches,
    upstream_requests = usage.upstream_requests + excluded.upstream_requests,
    entity_cache_hits = usage.entity_cache_hits + excluded.entity_cache_hits,
    candidate_cache_hits = usage.candidate_cache_hits + excluded.candidate_cache_hits,
    no_suitable_cache_hits = usage.no_suitable_cache_hits + excluded.no_suitable_cache_hits,
    successful_searches = usage.successful_searches + excluded.successful_searches,
    all_filtered_searches = usage.all_filtered_searches + excluded.all_filtered_searches,
    no_suitable_searches = usage.no_suitable_searches + excluded.no_suitable_searches,
    project_quota_reached = usage.project_quota_reached + excluded.project_quota_reached,
    timeout_count = usage.timeout_count + excluded.timeout_count,
    rate_limited_429 = usage.rate_limited_429 + excluded.rate_limited_429,
    upstream_error_503 = usage.upstream_error_503 + excluded.upstream_error_503,
    latency_under_2s = usage.latency_under_2s + excluded.latency_under_2s,
    latency_2_to_5s = usage.latency_2_to_5s + excluded.latency_2_to_5s,
    latency_5_to_20s = usage.latency_5_to_20s + excluded.latency_5_to_20s,
    updated_at = excluded.updated_at;

  delete from public.commons_precision_usage_daily
  where usage_date < (date_trunc('month', current_taipei_date)::date - interval '13 months')::date;
  return true;
exception when numeric_value_out_of_range then
  return false;
end;
$$;

revoke all on function public.tc_claim_commons_precision_upstream_slot(integer, integer) from public, anon, authenticated;
revoke all on function public.tc_acquire_commons_precision_upstream_lock(uuid) from public, anon, authenticated;
revoke all on function public.tc_release_commons_precision_upstream_lock(uuid) from public, anon, authenticated;
revoke all on function public.tc_put_commons_precision_cache(text, text, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.tc_acquire_commons_precision_cache_lock(text) from public, anon, authenticated;
revoke all on function public.tc_release_commons_precision_cache_lock(text) from public, anon, authenticated;
revoke all on function public.tc_add_commons_precision_usage(date, jsonb) from public, anon, authenticated;
grant execute on function public.tc_claim_commons_precision_upstream_slot(integer, integer) to service_role;
grant execute on function public.tc_acquire_commons_precision_upstream_lock(uuid) to service_role;
grant execute on function public.tc_release_commons_precision_upstream_lock(uuid) to service_role;
grant execute on function public.tc_put_commons_precision_cache(text, text, jsonb, timestamptz) to service_role;
grant execute on function public.tc_acquire_commons_precision_cache_lock(text) to service_role;
grant execute on function public.tc_release_commons_precision_cache_lock(text) to service_role;
grant execute on function public.tc_add_commons_precision_usage(date, jsonb) to service_role;

commit;
