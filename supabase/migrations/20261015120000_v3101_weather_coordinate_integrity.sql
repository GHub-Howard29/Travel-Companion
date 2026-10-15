-- V3.10.1 follow-up: retain the coordinates used by each forecast and invalidate
-- weather rows atomically when a Place ID resolves to different coordinates.
alter table public.weather_daily_forecasts
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'weather_daily_forecasts_latitude_check'
      and conrelid = 'public.weather_daily_forecasts'::regclass
  ) then
    alter table public.weather_daily_forecasts
      add constraint weather_daily_forecasts_latitude_check
      check (latitude is null or latitude between -90 and 90);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'weather_daily_forecasts_longitude_check'
      and conrelid = 'public.weather_daily_forecasts'::regclass
  ) then
    alter table public.weather_daily_forecasts
      add constraint weather_daily_forecasts_longitude_check
      check (longitude is null or longitude between -180 and 180);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'weather_daily_forecasts_coordinate_pair_check'
      and conrelid = 'public.weather_daily_forecasts'::regclass
  ) then
    alter table public.weather_daily_forecasts
      add constraint weather_daily_forecasts_coordinate_pair_check
      check ((latitude is null) = (longitude is null));
  end if;
end;
$$;

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

  select * into v_previous from public.weather_place_coordinates
  where place_id = p_place_id for update;

  insert into public.weather_place_coordinates (
    place_id, latitude, longitude, fetched_at, expires_at, status, last_error, updated_at
  ) values (
    p_place_id, p_latitude, p_longitude, p_fetched_at, p_expires_at, 'valid', null, now()
  )
  on conflict (place_id) do update set
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    fetched_at = excluded.fetched_at,
    expires_at = excluded.expires_at,
    status = 'valid',
    last_error = null,
    updated_at = now();

  if v_previous.place_id is not null
    and (v_previous.latitude is distinct from p_latitude or v_previous.longitude is distinct from p_longitude) then
    delete from public.weather_daily_forecasts where place_id = p_place_id;
  end if;
  return true;
end;
$$;

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
  insert into public.weather_daily_forecasts (
    place_id, forecast_date, timezone, latitude, longitude,
    refresh_lease_token, refresh_lease_until, last_refresh_attempt_at
  )
  select p_place_id, p_forecast_date, 'UTC', c.latitude, c.longitude,
    v_token, v_now + interval '30 seconds', v_now
  from public.weather_place_coordinates c
  where c.place_id = p_place_id and c.status = 'valid'
    and c.latitude is not null and c.longitude is not null and c.expires_at > v_now
  on conflict (place_id, forecast_date) do update
  set refresh_lease_token = excluded.refresh_lease_token,
      refresh_lease_until = excluded.refresh_lease_until,
      latitude = excluded.latitude,
      longitude = excluded.longitude,
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
  v_now timestamptz := now();
begin
  perform 1 from public.weather_daily_forecasts
  where place_id = p_place_id and forecast_date = p_forecast_date
    and refresh_lease_token = p_token and refresh_lease_until > v_now
  for update;
  if not found then return false; end if;

  if p_success and p_forecast is not null then
    update public.weather_daily_forecasts set
      timezone = p_forecast->>'timezone',
      latitude = (p_forecast->>'latitude')::double precision,
      longitude = (p_forecast->>'longitude')::double precision,
      weather_code = (p_forecast->>'weather_code')::integer,
      temperature_2m_max = (p_forecast->>'temperature_2m_max')::double precision,
      temperature_2m_min = (p_forecast->>'temperature_2m_min')::double precision,
      precipitation_probability_max = (p_forecast->>'precipitation_probability_max')::integer,
      fetched_at = v_now, last_refresh_failed_at = null, last_refresh_error = null,
      refresh_lease_token = null, refresh_lease_until = null, updated_at = v_now
    where place_id = p_place_id and forecast_date = p_forecast_date and refresh_lease_token = p_token
      and exists (
        select 1 from public.weather_place_coordinates c where c.place_id = p_place_id
          and c.status = 'valid'
          and c.latitude = (p_forecast->>'latitude')::double precision
          and c.longitude = (p_forecast->>'longitude')::double precision
          and c.expires_at > v_now
      );
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

revoke all on function public.tc_weather_store_coordinates(text, double precision, double precision, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.tc_weather_store_coordinates(text, double precision, double precision, timestamptz, timestamptz) to service_role;
