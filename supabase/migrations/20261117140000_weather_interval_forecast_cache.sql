-- Interval forecast cache: isolated raw hourly data with the same target key and lease boundary.
create table public.weather_interval_forecasts (
  place_id text not null references public.weather_place_coordinates(place_id) on delete cascade,
  forecast_date date not null,
  timezone text not null default 'UTC',
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  hourly_data jsonb,
  source text not null default 'Open-Meteo' check (source = 'Open-Meteo'),
  model text not null default 'best_match' check (model = 'best_match'),
  source_url text,
  fetched_at timestamptz,
  last_refresh_attempt_at timestamptz,
  last_scheduled_refresh_at timestamptz,
  last_refresh_failed_at timestamptz,
  last_refresh_error text,
  refresh_lease_token uuid,
  refresh_lease_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (place_id, forecast_date),
  constraint weather_interval_forecasts_coordinate_pair_check
    check (latitude is not null and longitude is not null),
  constraint weather_interval_forecasts_payload_pair_check
    check ((hourly_data is null) = (fetched_at is null)),
  constraint weather_interval_forecasts_hourly_object_check
    check (hourly_data is null or jsonb_typeof(hourly_data) = 'object'),
  constraint weather_interval_forecasts_lease_pair_check
    check ((refresh_lease_token is null) = (refresh_lease_until is null)),
  constraint weather_interval_forecasts_source_url_check
    check (source_url is null or source_url like 'https://open-meteo.com/en/docs%')
);

create index weather_interval_forecasts_fetched_at_idx
  on public.weather_interval_forecasts (fetched_at);

alter table public.weather_interval_forecasts enable row level security;
revoke all on public.weather_interval_forecasts from public, anon, authenticated, service_role;
grant select on public.weather_interval_forecasts to service_role;

create or replace function public.tc_weather_interval_claim_lease(
  p_place_id text,
  p_forecast_date date
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
  v_coordinates public.weather_place_coordinates%rowtype;
begin
  if p_place_id is null or btrim(p_place_id) = '' or p_forecast_date is null then
    raise exception 'INVALID_INTERVAL_LEASE_INPUT';
  end if;

  -- Serialize lease creation with coordinate refresh/invalidation.
  select * into v_coordinates
  from public.weather_place_coordinates
  where place_id = p_place_id
    and status = 'valid'
    and latitude is not null
    and longitude is not null
    and expires_at > v_now
  for share;
  if not found then return null; end if;

  -- Re-check expiry after any lock wait; do not lease against an expired coordinate row.
  v_now := clock_timestamp();
  if v_coordinates.expires_at is null or v_coordinates.expires_at <= v_now then
    return null;
  end if;

  insert into public.weather_interval_forecasts (
    place_id, forecast_date, timezone, latitude, longitude,
    refresh_lease_token, refresh_lease_until, last_refresh_attempt_at, updated_at
  ) values (
    p_place_id, p_forecast_date, 'UTC', v_coordinates.latitude, v_coordinates.longitude,
    v_token, v_now + interval '30 seconds', v_now, v_now
  )
  on conflict (place_id, forecast_date) do update
  set latitude = excluded.latitude,
      longitude = excluded.longitude,
      refresh_lease_token = excluded.refresh_lease_token,
      refresh_lease_until = excluded.refresh_lease_until,
      last_refresh_attempt_at = v_now,
      updated_at = v_now
  where public.weather_interval_forecasts.refresh_lease_until is null
     or public.weather_interval_forecasts.refresh_lease_until <= v_now;

  if not found then return null; end if;
  return v_token;
end;
$$;

create or replace function public.tc_weather_interval_release_lease(
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
  v_row public.weather_interval_forecasts%rowtype;
  v_coordinates public.weather_place_coordinates%rowtype;
  v_now timestamptz;
  v_timezone text;
  v_latitude double precision;
  v_longitude double precision;
  v_hourly jsonb;
begin
  if p_place_id is null or btrim(p_place_id) = '' or p_forecast_date is null or p_token is null then
    raise exception 'INVALID_INTERVAL_RELEASE_INPUT';
  end if;

  if p_success is true then
    if p_forecast is null or jsonb_typeof(p_forecast) is distinct from 'object' then
      raise exception 'INVALID_INTERVAL_FORECAST_PAYLOAD';
    end if;

    v_timezone := nullif(btrim(p_forecast->>'timezone'), '');
    v_hourly := p_forecast->'hourly_data';
    if v_timezone is null
      or not exists (select 1 from pg_timezone_names where name = v_timezone)
      or p_forecast->>'latitude' is null
      or p_forecast->>'longitude' is null
      or nullif(p_forecast->>'source_url', '') is null
      or (p_forecast->>'source_url') not like 'https://open-meteo.com/en/docs%'
      or jsonb_typeof(v_hourly) is distinct from 'object'
      or jsonb_typeof(v_hourly->'time') is distinct from 'array'
      or jsonb_typeof(v_hourly->'temperature_2m') is distinct from 'array'
      or jsonb_typeof(v_hourly->'precipitation_probability') is distinct from 'array'
      or jsonb_typeof(v_hourly->'weather_code') is distinct from 'array' then
      raise exception 'INVALID_INTERVAL_FORECAST_PAYLOAD';
    end if;

    if jsonb_array_length(v_hourly->'time') not between 23 and 25
      or jsonb_array_length(v_hourly->'temperature_2m') <> jsonb_array_length(v_hourly->'time')
      or jsonb_array_length(v_hourly->'precipitation_probability') <> jsonb_array_length(v_hourly->'time')
      or jsonb_array_length(v_hourly->'weather_code') <> jsonb_array_length(v_hourly->'time') then
      raise exception 'INVALID_INTERVAL_FORECAST_HOURLY_LENGTH';
    end if;

    v_latitude := (p_forecast->>'latitude')::double precision;
    v_longitude := (p_forecast->>'longitude')::double precision;
    if v_latitude < -90 or v_latitude > 90 or v_longitude < -180 or v_longitude > 180 then
      raise exception 'INVALID_INTERVAL_FORECAST_COORDINATES';
    end if;

    -- Keep the same lock order as V3.10.7: coordinate row before forecast row.
    select * into v_coordinates
    from public.weather_place_coordinates
    where place_id = p_place_id
    for share;
    if not found then return false; end if;

    v_now := clock_timestamp();
    if v_coordinates.status <> 'valid'
      or v_coordinates.latitude is null
      or v_coordinates.longitude is null
      or v_coordinates.expires_at is null
      or v_coordinates.expires_at <= v_now
      or abs(v_coordinates.latitude - v_latitude) > 0.0000001
      or abs(v_coordinates.longitude - v_longitude) > 0.0000001 then
      return false;
    end if;

    select * into v_row
    from public.weather_interval_forecasts
    where place_id = p_place_id
      and forecast_date = p_forecast_date
      and refresh_lease_token = p_token
    for update;
    if not found then return false; end if;

    v_now := clock_timestamp();
    if v_coordinates.expires_at <= v_now then return false; end if;

    update public.weather_interval_forecasts set
      timezone = v_timezone,
      latitude = v_latitude,
      longitude = v_longitude,
      hourly_data = v_hourly,
      source_url = p_forecast->>'source_url',
      fetched_at = v_now,
      last_refresh_failed_at = null,
      last_refresh_error = null,
      refresh_lease_token = null,
      refresh_lease_until = null,
      updated_at = v_now
    where place_id = p_place_id
      and forecast_date = p_forecast_date
      and refresh_lease_token = p_token
      and v_coordinates.expires_at > clock_timestamp();
    return found;
  end if;

  -- Failure release retains the last successful hourly_data and fetched_at.
  select * into v_row
  from public.weather_interval_forecasts
  where place_id = p_place_id
    and forecast_date = p_forecast_date
    and refresh_lease_token = p_token
  for update;
  if not found then return false; end if;

  v_now := clock_timestamp();
  update public.weather_interval_forecasts set
    last_refresh_failed_at = v_now,
    last_refresh_error = left(coalesce(nullif(p_error, ''), 'WEATHER_INTERVAL_REFRESH_FAILED'), 80),
    refresh_lease_token = null,
    refresh_lease_until = null,
    updated_at = v_now
  where place_id = p_place_id
    and forecast_date = p_forecast_date
    and refresh_lease_token = p_token;
  return found;
end;
$$;

create or replace function public.tc_weather_interval_mark_scheduled_refresh(
  p_place_id text,
  p_forecast_date date
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.weather_interval_forecasts
  set last_scheduled_refresh_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where place_id = p_place_id
    and forecast_date = p_forecast_date;
  return found;
end;
$$;

-- Coordinate changes invalidate both forecast types in the same transaction.
create or replace function public.tc_weather_store_coordinates(
  p_place_id text,
  p_latitude double precision,
  p_longitude double precision,
  p_fetched_at timestamptz,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_previous public.weather_place_coordinates%rowtype;
begin
  if p_place_id is null or btrim(p_place_id) = ''
    or p_latitude is null or p_latitude < -90 or p_latitude > 90
    or p_longitude is null or p_longitude < -180 or p_longitude > 180
    or p_fetched_at is null or p_expires_at <= p_fetched_at then
    raise exception 'INVALID_COORDINATE_CACHE_INPUT';
  end if;

  select * into v_previous
  from public.weather_place_coordinates
  where place_id = p_place_id
  for update;

  insert into public.weather_place_coordinates (
    place_id, latitude, longitude, fetched_at, expires_at, status, last_error, updated_at
  ) values (
    p_place_id, p_latitude, p_longitude, p_fetched_at, p_expires_at, 'valid', null, clock_timestamp()
  )
  on conflict (place_id) do update set
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    fetched_at = excluded.fetched_at,
    expires_at = excluded.expires_at,
    status = 'valid',
    last_error = null,
    updated_at = clock_timestamp();

  if v_previous.place_id is not null
    and (v_previous.latitude is distinct from p_latitude or v_previous.longitude is distinct from p_longitude) then
    delete from public.weather_daily_forecasts where place_id = p_place_id;
    delete from public.weather_interval_forecasts where place_id = p_place_id;
  end if;
  return true;
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
  where (fetched_at is not null and fetched_at <= clock_timestamp() - interval '48 hours')
     or forecast_date < (clock_timestamp() at time zone weather_daily_forecasts.timezone)::date
     or (fetched_at is null and refresh_lease_until is not null and refresh_lease_until <= clock_timestamp());

  delete from public.weather_interval_forecasts
  where (fetched_at is not null and fetched_at <= clock_timestamp() - interval '48 hours')
     or (fetched_at is not null and forecast_date < (clock_timestamp() at time zone weather_interval_forecasts.timezone)::date)
     or (fetched_at is null and refresh_lease_until is not null and refresh_lease_until <= clock_timestamp());

  -- Google Places coordinates are retained for at most 30 calendar days.
  update public.weather_place_coordinates
  set latitude = null, longitude = null, fetched_at = null, expires_at = null,
      status = 'pending', last_error = null, updated_at = clock_timestamp()
  where expires_at is not null and expires_at <= clock_timestamp();
end;
$$;

revoke all on function public.tc_weather_interval_claim_lease(text, date) from public, anon, authenticated;
revoke all on function public.tc_weather_interval_release_lease(text, date, uuid, boolean, jsonb, text) from public, anon, authenticated;
revoke all on function public.tc_weather_interval_mark_scheduled_refresh(text, date) from public, anon, authenticated, service_role;
grant execute on function public.tc_weather_interval_claim_lease(text, date) to service_role;
grant execute on function public.tc_weather_interval_release_lease(text, date, uuid, boolean, jsonb, text) to service_role;
grant execute on function public.tc_weather_interval_mark_scheduled_refresh(text, date) to service_role;

revoke all on function public.tc_weather_store_coordinates(text, double precision, double precision, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.tc_weather_store_coordinates(text, double precision, double precision, timestamptz, timestamptz)
  to service_role;
