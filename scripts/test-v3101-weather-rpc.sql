-- Local-only runtime regression for V3.10.1 weather cache RPCs.
-- Safe to rerun: all fixture rows are removed before the DO block completes.
do $test$
declare
  v_token uuid;
  v_second uuid;
  v_released boolean;
begin
  delete from public.weather_daily_forecasts where place_id = '__v3101_runtime_test__';
  delete from public.weather_place_coordinates where place_id = '__v3101_runtime_test__';

  insert into public.weather_place_coordinates(place_id, latitude, longitude, fetched_at, expires_at, status)
  values ('__v3101_runtime_test__', 25.0330, 121.5654, now(), now() + interval '30 days', 'valid');

  v_token := public.tc_weather_claim_lease('__v3101_runtime_test__', current_date + 1);
  if v_token is null then raise exception 'TEST_FAILED_FIRST_LEASE_NOT_GRANTED'; end if;

  v_second := public.tc_weather_claim_lease('__v3101_runtime_test__', current_date + 1);
  if v_second is not null then raise exception 'TEST_FAILED_DUPLICATE_LEASE_GRANTED'; end if;

  v_released := public.tc_weather_release_lease(
    '__v3101_runtime_test__', current_date + 1, v_token, true,
    jsonb_build_object('timezone','Asia/Taipei','weather_code',3,'temperature_2m_max',27.0,
      'temperature_2m_min',22.0,'precipitation_probability_max',40,'latitude',25.0330,'longitude',121.5654),
    null
  );
  if not v_released then raise exception 'TEST_FAILED_LEASE_RELEASE'; end if;

  if not exists (
    select 1 from public.weather_daily_forecasts
    where place_id='__v3101_runtime_test__' and forecast_date=current_date + 1
      and fetched_at is not null and refresh_lease_token is null
      and latitude=25.0330 and longitude=121.5654
  ) then raise exception 'TEST_FAILED_FORECAST_PERSISTENCE'; end if;

  perform public.tc_weather_store_coordinates(
    '__v3101_runtime_test__', 25.04, 121.57, now(), now() + interval '30 days'
  );
  if exists (select 1 from public.weather_daily_forecasts where place_id='__v3101_runtime_test__') then
    raise exception 'TEST_FAILED_COORDINATE_CHANGE_DID_NOT_INVALIDATE_FORECAST';
  end if;

  delete from public.weather_daily_forecasts where place_id = '__v3101_runtime_test__';
  delete from public.weather_place_coordinates where place_id = '__v3101_runtime_test__';
end
$test$;
