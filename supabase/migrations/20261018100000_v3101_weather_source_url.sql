-- Preserve the exact Open-Meteo documentation query used for each weather cache row.
alter table public.weather_daily_forecasts
  add column if not exists source_url text;

alter table public.weather_daily_forecasts
  drop constraint if exists weather_daily_forecasts_source_url_check;

alter table public.weather_daily_forecasts
  add constraint weather_daily_forecasts_source_url_check
  check (source_url is null or source_url like 'https://open-meteo.com/en/docs%');

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
    and refresh_lease_token = p_token
  for update;
  if not found then return false; end if;

  if p_success and p_forecast is not null then
    update public.weather_daily_forecasts set
      timezone = p_forecast->>'timezone',
      source_url = p_forecast->>'source_url',
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

revoke all on function public.tc_weather_release_lease(text, date, uuid, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.tc_weather_release_lease(text, date, uuid, boolean, jsonb, text) to service_role;
