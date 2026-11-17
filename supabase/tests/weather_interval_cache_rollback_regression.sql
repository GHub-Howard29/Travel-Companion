-- Transactional rollback rehearsal for 20261117140000_weather_interval_forecast_cache.sql.
-- This verifies the down-path without permanently changing the local database.
begin;

drop function public.tc_weather_interval_mark_scheduled_refresh(text, date);
drop function public.tc_weather_interval_release_lease(text, date, uuid, boolean, jsonb, text);
drop function public.tc_weather_interval_claim_lease(text, date);

-- Restore the pre-Interval coordinate cache function from 20261015120000.
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

-- Restore the pre-Interval hourly cleanup function from 20261015090000.
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

drop table public.weather_interval_forecasts;

do $$
begin
  if to_regclass('public.weather_interval_forecasts') is not null then
    raise exception 'INTERVAL_ROLLBACK_TABLE_STILL_EXISTS';
  end if;
  if to_regprocedure('public.tc_weather_interval_claim_lease(text,date)') is not null
    or to_regprocedure('public.tc_weather_interval_release_lease(text,date,uuid,boolean,jsonb,text)') is not null
    or to_regprocedure('public.tc_weather_interval_mark_scheduled_refresh(text,date)') is not null then
    raise exception 'INTERVAL_ROLLBACK_RPC_STILL_EXISTS';
  end if;
  if position('weather_interval_forecasts' in pg_get_functiondef('public.tc_weather_store_coordinates(text,double precision,double precision,timestamp with time zone,timestamp with time zone)'::regprocedure)) > 0
    or position('weather_interval_forecasts' in pg_get_functiondef('public.tc_weather_purge_expired_cache()'::regprocedure)) > 0 then
    raise exception 'INTERVAL_ROLLBACK_EXISTING_FUNCTION_NOT_RESTORED';
  end if;
end;
$$;

rollback;
