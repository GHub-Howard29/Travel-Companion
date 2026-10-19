-- Local-only regression probe for weather cache release semantics.
-- Run against the local Supabase DB only; all synthetic rows are rolled back.
BEGIN;
DO $$
DECLARE
  v_place text;
  v_day integer;
  v_token uuid;
  v_old_token uuid;
  v_new_token uuid;
  v_result boolean;
  v_lat double precision;
  v_lon double precision;
  v_test_places text[] := ARRAY[
    'TEST_WEATHER_DIAG_A',
    'TEST_WEATHER_DIAG_B',
    'TEST_WEATHER_DIAG_C'
  ];
  v_race_place text := 'TEST_WEATHER_COORD_RACE';
  v_race_date date := date '2099-03-01';
BEGIN
  FOREACH v_place IN ARRAY v_test_places LOOP
    v_lat := CASE v_place
      WHEN 'TEST_WEATHER_DIAG_A' THEN 22.6
      WHEN 'TEST_WEATHER_DIAG_B' THEN 23.0
      -- Precision-sensitive real-world coordinates reproduce JSONB float round-trip drift.
      ELSE 22.5749333
    END;
    v_lon := CASE v_place
      WHEN 'TEST_WEATHER_DIAG_A' THEN 120.2
      WHEN 'TEST_WEATHER_DIAG_B' THEN 120.3
      ELSE 120.3471544
    END;

    INSERT INTO public.weather_place_coordinates (
      place_id, latitude, longitude, fetched_at, expires_at, status, updated_at
    ) VALUES (
      v_place, v_lat, v_lon, now(), now() + interval '30 days', 'valid', now()
    )
    ON CONFLICT (place_id) DO UPDATE SET
      latitude = excluded.latitude,
      longitude = excluded.longitude,
      fetched_at = excluded.fetched_at,
      expires_at = excluded.expires_at,
      status = 'valid',
      last_error = null,
      updated_at = now();

    FOR v_day IN 1..5 LOOP
      SELECT public.tc_weather_claim_lease(
        v_place, (date '2099-02-01' + (v_day - 1))
      ) INTO v_token;
      IF v_token IS NULL THEN
        RAISE EXCEPTION 'TEST CLAIM FAILED place %, day %', v_place, v_day;
      END IF;

      IF v_day = 2 THEN
        SELECT public.tc_weather_release_lease(
          v_place, (date '2099-02-01' + (v_day - 1)), v_token, true,
          jsonb_build_object(
            'latitude', v_lat + 0.01, 'longitude', v_lon,
            'timezone', 'Asia/Taipei',
            'source_url', 'https://open-meteo.com/en/docs?test=1',
            'weather_code', 1, 'temperature_2m_max', 25,
            'temperature_2m_min', 18, 'precipitation_probability_max', 10
          )
        ) INTO v_result;
        IF v_result IS NOT FALSE THEN
          RAISE EXCEPTION 'TEST EXPECTED FALSE FOR COORDINATE MISMATCH place %, day %', v_place, v_day;
        END IF;

        SELECT public.tc_weather_release_lease(
          v_place, (date '2099-02-01' + (v_day - 1)), v_token, false,
          null, 'WEATHER_CACHE_WRITE_FAILED'
        ) INTO v_result;
        IF v_result IS NOT TRUE THEN
          RAISE EXCEPTION 'TEST FAILURE CLEANUP FAILED place %, day %', v_place, v_day;
        END IF;
      ELSE
        SELECT public.tc_weather_release_lease(
          v_place, (date '2099-02-01' + (v_day - 1)), v_token, true,
          jsonb_build_object(
            'latitude', v_lat, 'longitude', v_lon,
            'timezone', 'Asia/Taipei',
            'source_url', 'https://open-meteo.com/en/docs?test=1',
            'weather_code', 1, 'temperature_2m_max', 25,
            'temperature_2m_min', 18, 'precipitation_probability_max', 10
          )
        ) INTO v_result;
        IF v_result IS NOT TRUE THEN
          RAISE EXCEPTION 'TEST SUCCESS RELEASE FAILED place %, day %', v_place, v_day;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  -- Reproduce the coordinate-refresh race: updating a Place ID to different coordinates
  -- intentionally deletes its forecast rows, so a previously claimed lease can disappear
  -- between a successful preflight read and tc_weather_release_lease.
  PERFORM public.tc_weather_store_coordinates(
    v_race_place, 25.0, 121.0, now(), now() + interval '30 days'
  );
  SELECT public.tc_weather_claim_lease(v_race_place, v_race_date) INTO v_token;
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'TEST COORDINATE RACE CLAIM FAILED';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.weather_daily_forecasts f
    JOIN public.weather_place_coordinates c ON c.place_id = f.place_id
    WHERE f.place_id = v_race_place AND f.forecast_date = v_race_date
      AND f.refresh_lease_token = v_token AND c.status = 'valid'
      AND c.latitude = 25.0 AND c.longitude = 121.0
  ) THEN
    RAISE EXCEPTION 'TEST COORDINATE RACE PREFLIGHT SHOULD PASS';
  END IF;
  PERFORM public.tc_weather_store_coordinates(
    v_race_place, 25.1, 121.1, now(), now() + interval '30 days'
  );
  SELECT public.tc_weather_release_lease(
    v_race_place, v_race_date, v_token, true,
    jsonb_build_object(
      'latitude', 25.0, 'longitude', 121.0,
      'timezone', 'Asia/Taipei',
      'source_url', 'https://open-meteo.com/en/docs?test=1',
      'weather_code', 1, 'temperature_2m_max', 25,
      'temperature_2m_min', 18, 'precipitation_probability_max', 10
    )
  ) INTO v_result;
  IF v_result IS NOT FALSE THEN
    RAISE EXCEPTION 'TEST EXPECTED FALSE AFTER COORDINATE CHANGE';
  END IF;
  IF EXISTS (SELECT 1 FROM public.weather_daily_forecasts WHERE place_id = v_race_place AND forecast_date = v_race_date) THEN
    RAISE EXCEPTION 'TEST EXPECTED FORECAST ROW DELETED AFTER COORDINATE CHANGE';
  END IF;

  -- Race A: coordinates remain identical, but another request takes over the lease.
  -- The old request must not overwrite data or clear the newer request's token.
  PERFORM public.tc_weather_store_coordinates(
    'TEST_WEATHER_LEASE_REPLACED', 24.9, 121.4, now(), now() + interval '30 days'
  );
  SELECT public.tc_weather_claim_lease('TEST_WEATHER_LEASE_REPLACED', v_race_date)
    INTO v_token;
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'TEST REPLACED-LEASE FIRST CLAIM FAILED';
  END IF;
  UPDATE public.weather_daily_forecasts
  SET refresh_lease_until = now() - interval '1 second'
  WHERE place_id = 'TEST_WEATHER_LEASE_REPLACED' AND forecast_date = v_race_date
    AND refresh_lease_token = v_token;
  v_old_token := v_token;
  SELECT public.tc_weather_claim_lease('TEST_WEATHER_LEASE_REPLACED', v_race_date)
    INTO v_new_token;
  IF v_new_token IS NULL OR v_new_token = v_old_token THEN
    RAISE EXCEPTION 'TEST REPLACED-LEASE SECOND CLAIM FAILED';
  END IF;
  SELECT public.tc_weather_release_lease(
    'TEST_WEATHER_LEASE_REPLACED', v_race_date, v_old_token, true,
    jsonb_build_object(
      'latitude', 24.9, 'longitude', 121.4, 'timezone', 'Asia/Taipei',
      'weather_code', 1, 'temperature_2m_max', 25,
      'temperature_2m_min', 18, 'precipitation_probability_max', 10
    )
  ) INTO v_result;
  IF v_result IS NOT FALSE THEN
    RAISE EXCEPTION 'TEST OLD LEASE SHOULD BE REJECTED AFTER REPLACEMENT';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.weather_daily_forecasts
    WHERE place_id = 'TEST_WEATHER_LEASE_REPLACED' AND forecast_date = v_race_date
      AND refresh_lease_token = v_new_token AND fetched_at IS NULL
  ) THEN
    RAISE EXCEPTION 'TEST OLD LEASE MODIFIED THE NEW LEASE ROW';
  END IF;

  -- Race B1: coordinate values do not change, but status becomes invalid before write-back.
  PERFORM public.tc_weather_store_coordinates(
    'TEST_WEATHER_STATUS_CHANGED', 24.8, 121.3, now(), now() + interval '30 days'
  );
  SELECT public.tc_weather_claim_lease('TEST_WEATHER_STATUS_CHANGED', v_race_date)
    INTO v_token;
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'TEST STATUS-CHANGE CLAIM FAILED';
  END IF;
  UPDATE public.weather_place_coordinates SET status = 'pending'
  WHERE place_id = 'TEST_WEATHER_STATUS_CHANGED';
  SELECT public.tc_weather_release_lease(
    'TEST_WEATHER_STATUS_CHANGED', v_race_date, v_token, true,
    jsonb_build_object(
      'latitude', 24.8, 'longitude', 121.3, 'timezone', 'Asia/Taipei',
      'weather_code', 1, 'temperature_2m_max', 25,
      'temperature_2m_min', 18, 'precipitation_probability_max', 10
    )
  ) INTO v_result;
  IF v_result IS NOT FALSE THEN
    RAISE EXCEPTION 'TEST RELEASE SHOULD REJECT COORDINATE STATUS CHANGE';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.weather_daily_forecasts
    WHERE place_id = 'TEST_WEATHER_STATUS_CHANGED' AND forecast_date = v_race_date
      AND fetched_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'TEST STATUS CHANGE MUST NOT WRITE FORECAST DATA';
  END IF;

  -- Race B2: coordinate values and status stay the same, but the coordinate TTL expires.
  PERFORM public.tc_weather_store_coordinates(
    'TEST_WEATHER_TTL_EXPIRED', 24.7, 121.2, now(), now() + interval '30 days'
  );
  SELECT public.tc_weather_claim_lease('TEST_WEATHER_TTL_EXPIRED', v_race_date)
    INTO v_token;
  IF v_token IS NULL THEN
    RAISE EXCEPTION 'TEST TTL-EXPIRY CLAIM FAILED';
  END IF;
  UPDATE public.weather_place_coordinates SET expires_at = now() - interval '1 second'
  WHERE place_id = 'TEST_WEATHER_TTL_EXPIRED';
  SELECT public.tc_weather_release_lease(
    'TEST_WEATHER_TTL_EXPIRED', v_race_date, v_token, true,
    jsonb_build_object(
      'latitude', 24.7, 'longitude', 121.2, 'timezone', 'Asia/Taipei',
      'weather_code', 1, 'temperature_2m_max', 25,
      'temperature_2m_min', 18, 'precipitation_probability_max', 10
    )
  ) INTO v_result;
  IF v_result IS NOT FALSE THEN
    RAISE EXCEPTION 'TEST RELEASE SHOULD REJECT EXPIRED COORDINATE TTL';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.weather_daily_forecasts
    WHERE place_id = 'TEST_WEATHER_TTL_EXPIRED' AND forecast_date = v_race_date
      AND fetched_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'TEST EXPIRED TTL MUST NOT WRITE FORECAST DATA';
  END IF;

  RAISE NOTICE 'PASS: baseline success/mismatch cases plus independent coordinate-change, replaced-lease, status-change, and TTL-expiry regressions.';
END $$;
ROLLBACK;
