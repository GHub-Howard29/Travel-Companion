-- Serialize successful weather-cache write-back with coordinate-state changes.
-- Keep the lock order consistent with tc_weather_store_coordinates: coordinates first,
-- then the forecast/lease row. Re-check the coordinate TTL after acquiring both locks.
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
  v_coordinates public.weather_place_coordinates%rowtype;
  v_now timestamptz;
begin
  if p_success and p_forecast is not null then
    -- Coordinate refresh/invalidation takes this lock before deleting forecast rows.
    -- FOR SHARE prevents status/coordinate/expiry updates until this write-back finishes.
    select * into v_coordinates
    from public.weather_place_coordinates
    where place_id = p_place_id
    for share;
    if not found then return false; end if;

    v_now := clock_timestamp();
    if v_coordinates.status <> 'valid'
      or v_coordinates.latitude is distinct from (p_forecast->>'latitude')::double precision
      or v_coordinates.longitude is distinct from (p_forecast->>'longitude')::double precision
      or v_coordinates.expires_at is null
      or v_coordinates.expires_at <= v_now then
      return false;
    end if;

    -- Lock and revalidate the lease only after locking coordinates. A newer claim
    -- can replace the token while this call waits; the stale owner must not write.
    select * into v_row
    from public.weather_daily_forecasts
    where place_id = p_place_id
      and forecast_date = p_forecast_date
      and refresh_lease_token = p_token
    for update;
    if not found then return false; end if;

    -- clock_timestamp() is intentional: now() is fixed at transaction start and
    -- could incorrectly accept a coordinate TTL that expired while waiting on locks.
    v_now := clock_timestamp();
    if v_coordinates.expires_at <= v_now then return false; end if;

    update public.weather_daily_forecasts set
      timezone = p_forecast->>'timezone',
      source_url = p_forecast->>'source_url',
      weather_code = (p_forecast->>'weather_code')::integer,
      temperature_2m_max = (p_forecast->>'temperature_2m_max')::double precision,
      temperature_2m_min = (p_forecast->>'temperature_2m_min')::double precision,
      precipitation_probability_max = (p_forecast->>'precipitation_probability_max')::integer,
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

  -- Failure release does not need the coordinate row, but still must own the token.
  select * into v_row
  from public.weather_daily_forecasts
  where place_id = p_place_id
    and forecast_date = p_forecast_date
    and refresh_lease_token = p_token
  for update;
  if not found then return false; end if;

  v_now := clock_timestamp();
  update public.weather_daily_forecasts set
    last_refresh_failed_at = v_now,
    last_refresh_error = left(coalesce(p_error, 'WEATHER_REFRESH_FAILED'), 80),
    refresh_lease_token = null,
    refresh_lease_until = null,
    updated_at = v_now
  where place_id = p_place_id
    and forecast_date = p_forecast_date
    and refresh_lease_token = p_token;
  return found;
end;
$$;

revoke all on function public.tc_weather_release_lease(text, date, uuid, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.tc_weather_release_lease(text, date, uuid, boolean, jsonb, text) to service_role;
