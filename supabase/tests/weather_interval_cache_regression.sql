-- Run after applying all migrations to a disposable local Supabase database:
-- psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/weather_interval_cache_regression.sql
-- All fixture writes are rolled back at the end.
begin;

do $$
declare
  v_place text := 'weather-interval-regression-' || replace(gen_random_uuid()::text, '-', '');
  v_ttl_place text := 'weather-interval-ttl-' || replace(gen_random_uuid()::text, '-', '');
  v_past_place text := 'weather-interval-past-' || replace(gen_random_uuid()::text, '-', '');
  v_lease_place text := 'weather-interval-lease-' || replace(gen_random_uuid()::text, '-', '');
  v_token uuid;
  v_second_token uuid;
  v_other_date_token uuid;
  v_hourly jsonb;
  v_cached_hourly jsonb;
  v_fetched_at timestamptz;
  v_scheduled_at timestamptz;
  v_target_date date := current_date + 5;
  v_other_date date := current_date + 6;
  v_payload jsonb;
begin
  if has_table_privilege('anon', 'public.weather_interval_forecasts', 'SELECT')
    or has_table_privilege('authenticated', 'public.weather_interval_forecasts', 'SELECT')
    or has_table_privilege('service_role', 'public.weather_interval_forecasts', 'INSERT')
    or has_table_privilege('service_role', 'public.weather_interval_forecasts', 'UPDATE')
    or has_table_privilege('service_role', 'public.weather_interval_forecasts', 'DELETE')
    or not has_table_privilege('service_role', 'public.weather_interval_forecasts', 'SELECT') then
    raise exception 'INTERVAL_TABLE_GRANTS_REGRESSION';
  end if;

  if has_function_privilege('anon', 'public.tc_weather_interval_claim_lease(text,date)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.tc_weather_interval_claim_lease(text,date)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.tc_weather_interval_claim_lease(text,date)', 'EXECUTE')
    or has_function_privilege('anon', 'public.tc_weather_interval_release_lease(text,date,uuid,boolean,jsonb,text)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.tc_weather_interval_release_lease(text,date,uuid,boolean,jsonb,text)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.tc_weather_interval_release_lease(text,date,uuid,boolean,jsonb,text)', 'EXECUTE')
    or has_function_privilege('anon', 'public.tc_weather_interval_mark_scheduled_refresh(text,date)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.tc_weather_interval_mark_scheduled_refresh(text,date)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.tc_weather_interval_mark_scheduled_refresh(text,date)', 'EXECUTE') then
    raise exception 'INTERVAL_RPC_GRANTS_REGRESSION';
  end if;

  select jsonb_build_object(
    'time', (select jsonb_agg(to_jsonb(g)) from generate_series(1, 24) as g),
    'temperature_2m', (select jsonb_agg(to_jsonb(18.5)) from generate_series(1, 24)),
    'precipitation_probability', (select jsonb_agg(to_jsonb(20)) from generate_series(1, 24)),
    'weather_code', (select jsonb_agg(to_jsonb(3)) from generate_series(1, 24))
  ) into v_hourly;

  v_payload := jsonb_build_object(
    'timezone', 'Etc/UTC',
    'latitude', 35.6812,
    'longitude', 139.7671,
    'source_url', 'https://open-meteo.com/en/docs?hourly=temperature_2m%2Cprecipitation_probability%2Cweather_code',
    'hourly_data', v_hourly
  );

  perform public.tc_weather_store_coordinates(
    v_place, 35.6812, 139.7671, clock_timestamp(), clock_timestamp() + interval '30 days'
  );

  -- One place/date is one shared cache target; a second claim for the same key is blocked.
  v_token := public.tc_weather_interval_claim_lease(v_place, v_target_date);
  if v_token is null then raise exception 'INTERVAL_FIRST_CLAIM_FAILED'; end if;
  v_second_token := public.tc_weather_interval_claim_lease(v_place, v_target_date);
  if v_second_token is not null then raise exception 'INTERVAL_DUPLICATE_LEASE_GRANTED'; end if;

  -- Different forecast dates at the same Place ID are independent cache targets.
  v_other_date_token := public.tc_weather_interval_claim_lease(v_place, v_other_date);
  if v_other_date_token is null then raise exception 'INTERVAL_DIFFERENT_DATE_NOT_INDEPENDENT'; end if;

  if not public.tc_weather_interval_release_lease(
    v_place, v_target_date, v_token, false, null, 'TEST_REFRESH_FAILURE'
  ) then
    raise exception 'INTERVAL_FAILURE_RELEASE_FAILED';
  end if;

  select fetched_at into v_fetched_at
  from public.weather_interval_forecasts
  where place_id = v_place and forecast_date = v_target_date;
  if v_fetched_at is not null then raise exception 'INTERVAL_FAILURE_CREATED_SUCCESS_CACHE'; end if;

  v_token := public.tc_weather_interval_claim_lease(v_place, v_target_date);
  if v_token is null then raise exception 'INTERVAL_RECLAIM_AFTER_FAILURE_FAILED'; end if;
  if not public.tc_weather_interval_release_lease(v_place, v_target_date, v_token, true, v_payload, null) then
    raise exception 'INTERVAL_SUCCESS_RELEASE_FAILED';
  end if;

  select fetched_at, hourly_data into v_fetched_at, v_cached_hourly
  from public.weather_interval_forecasts
  where place_id = v_place and forecast_date = v_target_date;
  if v_fetched_at is null then raise exception 'INTERVAL_SUCCESS_FETCHED_AT_MISSING'; end if;

  -- A later failed refresh must preserve the last successful payload and fetched_at.
  v_second_token := public.tc_weather_interval_claim_lease(v_place, v_target_date);
  if v_second_token is null then raise exception 'INTERVAL_RECLAIM_AFTER_SUCCESS_FAILED'; end if;
  if not public.tc_weather_interval_release_lease(v_place, v_target_date, v_second_token, false, null, 'LATER_REFRESH_FAILURE') then
    raise exception 'INTERVAL_LATER_FAILURE_RELEASE_FAILED';
  end if;
  if not exists (
    select 1 from public.weather_interval_forecasts
    where place_id = v_place and forecast_date = v_target_date
      and fetched_at = v_fetched_at and hourly_data = v_cached_hourly
      and last_refresh_failed_at is not null
  ) then
    raise exception 'INTERVAL_FAILURE_DID_NOT_PRESERVE_SUCCESS_CACHE';
  end if;

  if public.tc_weather_interval_release_lease(v_place, v_target_date, v_token, false, null, 'STALE_TOKEN') then
    raise exception 'INTERVAL_STALE_TOKEN_ACCEPTED';
  end if;

  if not public.tc_weather_interval_mark_scheduled_refresh(v_place, v_target_date) then
    raise exception 'INTERVAL_MARK_SCHEDULED_FAILED';
  end if;
  select last_scheduled_refresh_at into v_scheduled_at
  from public.weather_interval_forecasts
  where place_id = v_place and forecast_date = v_target_date;
  if v_scheduled_at is null then raise exception 'INTERVAL_SCHEDULED_TIMESTAMP_MISSING'; end if;

  -- A Place ID coordinate change invalidates all interval dates for that Place ID atomically.
  perform public.tc_weather_store_coordinates(
    v_place, 35.7000, 139.7500, clock_timestamp(), clock_timestamp() + interval '30 days'
  );
  if exists (select 1 from public.weather_interval_forecasts where place_id = v_place) then
    raise exception 'INTERVAL_COORDINATE_CHANGE_DID_NOT_INVALIDATE';
  end if;

  -- A successful cache older than 48 hours is purged.
  perform public.tc_weather_store_coordinates(
    v_ttl_place, 35.6812, 139.7671, clock_timestamp(), clock_timestamp() + interval '30 days'
  );
  v_token := public.tc_weather_interval_claim_lease(v_ttl_place, v_target_date);
  if v_token is null or not public.tc_weather_interval_release_lease(v_ttl_place, v_target_date, v_token, true, v_payload, null) then
    raise exception 'INTERVAL_TTL_FIXTURE_FAILED';
  end if;
  update public.weather_interval_forecasts
  set fetched_at = clock_timestamp() - interval '49 hours'
  where place_id = v_ttl_place and forecast_date = v_target_date;
  perform public.tc_weather_purge_expired_cache();
  if exists (select 1 from public.weather_interval_forecasts where place_id = v_ttl_place) then
    raise exception 'INTERVAL_48H_TTL_PURGE_FAILED';
  end if;

  -- A destination date already in the past is purged independently of the 48-hour TTL.
  perform public.tc_weather_store_coordinates(
    v_past_place, 35.6812, 139.7671, clock_timestamp(), clock_timestamp() + interval '30 days'
  );
  v_token := public.tc_weather_interval_claim_lease(v_past_place, current_date - 1);
  if v_token is null or not public.tc_weather_interval_release_lease(v_past_place, current_date - 1, v_token, true, v_payload, null) then
    raise exception 'INTERVAL_PAST_DATE_FIXTURE_FAILED';
  end if;
  perform public.tc_weather_purge_expired_cache();
  if exists (select 1 from public.weather_interval_forecasts where place_id = v_past_place) then
    raise exception 'INTERVAL_PAST_DATE_PURGE_FAILED';
  end if;

  -- Expired placeholders without a successful payload are purged.
  perform public.tc_weather_store_coordinates(
    v_lease_place, 35.6812, 139.7671, clock_timestamp(), clock_timestamp() + interval '30 days'
  );
  v_token := public.tc_weather_interval_claim_lease(v_lease_place, v_target_date);
  if v_token is null then raise exception 'INTERVAL_PLACEHOLDER_FIXTURE_FAILED'; end if;
  update public.weather_interval_forecasts
  set refresh_lease_until = clock_timestamp() - interval '1 second'
  where place_id = v_lease_place and forecast_date = v_target_date;
  perform public.tc_weather_purge_expired_cache();
  if exists (select 1 from public.weather_interval_forecasts where place_id = v_lease_place) then
    raise exception 'INTERVAL_EXPIRED_PLACEHOLDER_PURGE_FAILED';
  end if;
end;
$$;

rollback;
