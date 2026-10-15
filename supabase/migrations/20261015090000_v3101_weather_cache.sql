-- V3.10.1 weather cache: isolated from Trip JSON and route_estimate_cache.
create table if not exists public.weather_place_coordinates (
  place_id text primary key,
  latitude double precision,
  longitude double precision,
  fetched_at timestamptz,
  expires_at timestamptz,
  status text not null default 'pending' check (status in ('valid', 'pending', 'failed')),
  last_error text,
  updated_at timestamptz not null default now(),
  constraint weather_place_coordinates_latitude_check check (latitude is null or latitude between -90 and 90),
  constraint weather_place_coordinates_longitude_check check (longitude is null or longitude between -180 and 180),
  constraint weather_place_coordinates_valid_pair_check check ((latitude is null) = (longitude is null))
);

create table if not exists public.weather_daily_forecasts (
  place_id text not null references public.weather_place_coordinates(place_id) on delete cascade,
  forecast_date date not null,
  timezone text not null,
  weather_code integer,
  temperature_2m_max double precision,
  temperature_2m_min double precision,
  precipitation_probability_max integer check (precipitation_probability_max is null or precipitation_probability_max between 0 and 100),
  source text not null default 'Open-Meteo' check (source = 'Open-Meteo'),
  model text not null default 'best_match' check (model = 'best_match'),
  fetched_at timestamptz,
  last_refresh_attempt_at timestamptz,
  last_scheduled_refresh_at timestamptz,
  last_refresh_failed_at timestamptz,
  last_refresh_error text,
  refresh_lease_token uuid,
  refresh_lease_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (place_id, forecast_date),
  constraint weather_daily_forecasts_lease_pair_check check ((refresh_lease_token is null) = (refresh_lease_until is null))
);

create index if not exists weather_daily_forecasts_fetched_at_idx
  on public.weather_daily_forecasts (fetched_at);

alter table public.weather_place_coordinates enable row level security;
alter table public.weather_daily_forecasts enable row level security;
revoke all on public.weather_place_coordinates from anon, authenticated;
revoke all on public.weather_daily_forecasts from anon, authenticated;
grant all on public.weather_place_coordinates to service_role;
grant all on public.weather_daily_forecasts to service_role;

create or replace function public.tc_weather_claim_lease(p_place_id text, p_forecast_date date)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token uuid := gen_random_uuid();
  v_now timestamptz := now();
begin
  insert into public.weather_daily_forecasts (place_id, forecast_date, timezone, refresh_lease_token, refresh_lease_until, last_refresh_attempt_at)
  select p_place_id, p_forecast_date, 'UTC', v_token, v_now + interval '30 seconds', v_now
  from public.weather_place_coordinates c
  where c.place_id = p_place_id and c.status = 'valid' and c.latitude is not null and c.longitude is not null and c.expires_at > v_now
  on conflict (place_id, forecast_date) do update
  set refresh_lease_token = excluded.refresh_lease_token,
      refresh_lease_until = excluded.refresh_lease_until,
      last_refresh_attempt_at = v_now,
      updated_at = v_now
  where public.weather_daily_forecasts.refresh_lease_until is null
     or public.weather_daily_forecasts.refresh_lease_until <= v_now;

  if not found then return null; end if;
  return v_token;
end;
$$;

create or replace function public.tc_weather_release_lease(
  p_place_id text,
  p_forecast_date date,
  p_token uuid,
  p_success boolean,
  p_forecast jsonb default null,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row public.weather_daily_forecasts%rowtype;
  v_now timestamptz := now();
begin
  select * into v_row from public.weather_daily_forecasts
  where place_id = p_place_id and forecast_date = p_forecast_date
    and refresh_lease_token = p_token and refresh_lease_until > v_now
  for update;
  if not found then return false; end if;

  if p_success and p_forecast is not null then
    update public.weather_daily_forecasts set
      timezone = p_forecast->>'timezone',
      weather_code = (p_forecast->>'weather_code')::integer,
      temperature_2m_max = (p_forecast->>'temperature_2m_max')::double precision,
      temperature_2m_min = (p_forecast->>'temperature_2m_min')::double precision,
      precipitation_probability_max = (p_forecast->>'precipitation_probability_max')::integer,
      fetched_at = v_now, last_refresh_failed_at = null, last_refresh_error = null,
      refresh_lease_token = null, refresh_lease_until = null, updated_at = v_now
    where place_id = p_place_id and forecast_date = p_forecast_date and refresh_lease_token = p_token
      and exists (select 1 from public.weather_place_coordinates c where c.place_id = p_place_id
        and c.status = 'valid' and c.latitude = (p_forecast->>'latitude')::double precision
        and c.longitude = (p_forecast->>'longitude')::double precision and c.expires_at > v_now);
  else
    update public.weather_daily_forecasts set
      last_refresh_failed_at = v_now,
      last_refresh_error = left(coalesce(p_error, 'WEATHER_REFRESH_FAILED'), 80),
      refresh_lease_token = null, refresh_lease_until = null, updated_at = v_now
    where place_id = p_place_id and forecast_date = p_forecast_date and refresh_lease_token = p_token;
  end if;
  return found;
end;
$$;

create or replace function public.tc_weather_purge_expired_cache()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.weather_daily_forecasts
  where (fetched_at is not null and fetched_at <= now() - interval '48 hours')
     or forecast_date < (now() at time zone weather_daily_forecasts.timezone)::date
     or (fetched_at is null and refresh_lease_until is not null and refresh_lease_until <= now());

  -- Google Places coordinates are retained for at most 30 calendar days.
  -- Weather rows intentionally do not duplicate latitude/longitude values.
  update public.weather_place_coordinates
  set latitude = null, longitude = null, fetched_at = null, expires_at = null,
      status = 'pending', last_error = null, updated_at = now()
  where expires_at is not null and expires_at <= now();
end;
$$;

revoke all on function public.tc_weather_claim_lease(text, date) from public, anon, authenticated;
revoke all on function public.tc_weather_release_lease(text, date, uuid, boolean, jsonb, text) from public, anon, authenticated;
revoke all on function public.tc_weather_purge_expired_cache() from public, anon, authenticated, service_role;
grant execute on function public.tc_weather_claim_lease(text, date) to service_role;
grant execute on function public.tc_weather_release_lease(text, date, uuid, boolean, jsonb, text) to service_role;

-- Run cleanup hourly so expired Google coordinates are removed soon after the 30-day TTL.
create extension if not exists pg_cron with schema extensions;
do $$
begin
  if exists (select 1 from cron.job where jobname = 'travel-companion-weather-cache-cleanup') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'travel-companion-weather-cache-cleanup';
  end if;

  perform cron.schedule(
    'travel-companion-weather-cache-cleanup',
    '5 * * * *',
    $cron$select public.tc_weather_purge_expired_cache();$cron$
  );
end;
$$;
