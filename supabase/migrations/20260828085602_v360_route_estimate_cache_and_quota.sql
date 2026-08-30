-- Travel Companion V3.6.0 route estimate server-side cache and quota.
--
-- Saved results visible to guests remain inside trips.content so the existing
-- Offline First and public Trip read flow stays intact. These tables are only
-- server-side infrastructure for authenticated editor queries.

begin;

create table public.route_estimate_cache (
  cache_key text primary key,
  trip_id text not null references public.trips(id) on delete cascade,
  travel_mode text not null,
  origin_key text not null,
  destination_key text not null,
  departure_bucket text,
  duration_seconds integer not null,
  distance_meters integer not null,
  transit_daytime_fallback boolean not null default false,
  transit_vehicle text,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_estimate_cache_key_length_check check (
    length(cache_key) between 16 and 128
  ),
  constraint route_estimate_cache_mode_check check (
    travel_mode in ('drive', 'walk', 'transit')
  ),
  constraint route_estimate_cache_duration_check check (duration_seconds > 0),
  constraint route_estimate_cache_distance_check check (distance_meters >= 0),
  constraint route_estimate_cache_endpoints_check check (
    origin_key <> destination_key
  ),
  constraint route_estimate_cache_departure_check check (
    (travel_mode = 'transit' and departure_bucket is not null)
    or (travel_mode <> 'transit' and departure_bucket is null)
  ),
  constraint route_estimate_cache_vehicle_check check (
    (travel_mode <> 'transit' and transit_vehicle is null)
    or (
      travel_mode = 'transit'
      and transit_vehicle is not null
      and transit_vehicle in ('bus', 'rail', 'subway', 'tram', 'ferry', 'other')
    )
  ),
  constraint route_estimate_cache_expiry_check check (
    expires_at > created_at
  )
);

create index route_estimate_cache_trip_expiry_idx
on public.route_estimate_cache (trip_id, expires_at);

drop trigger if exists route_estimate_cache_touch_updated_at
on public.route_estimate_cache;
create trigger route_estimate_cache_touch_updated_at
before update on public.route_estimate_cache
for each row
execute function public.tc_touch_updated_at();

alter table public.route_estimate_cache enable row level security;
revoke all on table public.route_estimate_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.route_estimate_cache to service_role;

create table public.route_query_daily_usage (
  query_date date primary key,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  constraint route_query_daily_usage_count_check check (
    request_count between 0 and 10000
  )
);

alter table public.route_query_daily_usage enable row level security;
revoke all on table public.route_query_daily_usage from public, anon, authenticated;
grant select, insert, update on table public.route_query_daily_usage to service_role;

create or replace function public.tc_claim_route_query_slot(
  maximum_requests integer default 100
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed_count integer;
  utc_date date := (now() at time zone 'utc')::date;
begin
  if maximum_requests < 1 or maximum_requests > 10000 then
    raise exception 'maximum_requests is outside the allowed range';
  end if;

  insert into public.route_query_daily_usage as usage (
    query_date,
    request_count,
    updated_at
  )
  values (utc_date, 1, now())
  on conflict (query_date) do update
  set request_count = usage.request_count + 1,
      updated_at = now()
  where usage.request_count < maximum_requests
  returning request_count into claimed_count;

  return claimed_count is not null and claimed_count <= maximum_requests;
end;
$$;

revoke execute on function public.tc_claim_route_query_slot(integer)
from public, anon, authenticated;
grant execute on function public.tc_claim_route_query_slot(integer)
to service_role;

commit;
