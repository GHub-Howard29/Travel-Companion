-- Keep the scheduled-refresh timestamp writable through a narrowly scoped RPC.
-- service_role intentionally has SELECT-only access to weather_daily_forecasts.
create or replace function public.tc_weather_mark_scheduled_refresh(
  p_place_id text,
  p_forecast_date date
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.weather_daily_forecasts
  set last_scheduled_refresh_at = now(),
      updated_at = now()
  where place_id = p_place_id
    and forecast_date = p_forecast_date;
  return found;
end;
$$;

revoke all on function public.tc_weather_mark_scheduled_refresh(text, date)
  from public, anon, authenticated, service_role;
grant execute on function public.tc_weather_mark_scheduled_refresh(text, date)
  to service_role;
