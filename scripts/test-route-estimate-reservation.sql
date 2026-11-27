-- Local-only regression probe for keyed route estimate reservations.
-- Uses synthetic cache keys and rolls every write back. Never run against production.
BEGIN;
DO $$
DECLARE
  v_key text := repeat('a', 64);
  v_other_key text := repeat('b', 64);
  v_expired_key text := repeat('c', 64);
  v_old_owner uuid := '10000000-0000-4000-8000-000000000001';
  v_new_owner uuid := '10000000-0000-4000-8000-000000000002';
  v_other_owner uuid := '10000000-0000-4000-8000-000000000003';
  v_claimed boolean;
  v_owned boolean;
  v_released boolean;
  v_stored boolean;
  v_trip_id text := 'trip-f66985d6-0c17-476b-94a7-77678332957e';
BEGIN
  -- Same key is exclusive; a different key is independent.
  SELECT public.tc_claim_route_estimate_reservation(v_key, v_old_owner, 90)
    INTO v_claimed;
  IF v_claimed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST FIRST CLAIM SHOULD SUCCEED';
  END IF;
  SELECT public.tc_claim_route_estimate_reservation(v_key, v_new_owner, 90)
    INTO v_claimed;
  IF v_claimed IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'TEST SAME-KEY CLAIM SHOULD BE REJECTED';
  END IF;
  SELECT public.tc_claim_route_estimate_reservation(v_other_key, v_other_owner, 90)
    INTO v_claimed;
  IF v_claimed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST DIFFERENT KEY CLAIM SHOULD SUCCEED';
  END IF;

  -- Only the current owner may inspect or release the reservation.
  SELECT public.tc_is_route_estimate_reservation_owner(v_key, v_old_owner)
    INTO v_owned;
  IF v_owned IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST CURRENT OWNER CHECK SHOULD SUCCEED';
  END IF;
  SELECT public.tc_is_route_estimate_reservation_owner(v_key, v_new_owner)
    INTO v_owned;
  IF v_owned IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'TEST NON-OWNER CHECK SHOULD FAIL';
  END IF;
  SELECT public.tc_release_route_estimate_reservation(v_key, v_new_owner)
    INTO v_released;
  IF v_released IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'TEST NON-OWNER RELEASE SHOULD FAIL';
  END IF;
  SELECT public.tc_release_route_estimate_reservation(v_key, v_old_owner)
    INTO v_released;
  IF v_released IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST OWNER RELEASE SHOULD SUCCEED';
  END IF;

  -- A waiter may become the owner after an explicit release.
  SELECT public.tc_claim_route_estimate_reservation(v_key, v_new_owner, 90)
    INTO v_claimed;
  IF v_claimed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST CLAIM AFTER RELEASE SHOULD SUCCEED';
  END IF;

  -- An expired owner can be replaced; its late release cannot remove the new owner.
  SELECT public.tc_claim_route_estimate_reservation(v_expired_key, v_old_owner, 90)
    INTO v_claimed;
  IF v_claimed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST EXPIRY FIRST CLAIM SHOULD SUCCEED';
  END IF;
  UPDATE public.route_estimate_reservations
     SET expires_at = clock_timestamp() - interval '1 second'
   WHERE cache_key = v_expired_key AND owner_token = v_old_owner;
  SELECT public.tc_claim_route_estimate_reservation(v_expired_key, v_new_owner, 90)
    INTO v_claimed;
  IF v_claimed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST EXPIRED RESERVATION TAKEOVER SHOULD SUCCEED';
  END IF;
  SELECT public.tc_release_route_estimate_reservation(v_expired_key, v_old_owner)
    INTO v_released;
  IF v_released IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'TEST LATE OLD-OWNER RELEASE SHOULD NOT SUCCEED';
  END IF;
  SELECT public.tc_is_route_estimate_reservation_owner(v_expired_key, v_new_owner)
    INTO v_owned;
  IF v_owned IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST NEW OWNER MUST REMAIN ACTIVE';
  END IF;

  -- A failed owner releases in finally; the next request can claim and retry.
  SELECT public.tc_claim_route_estimate_reservation(repeat('e', 64), v_old_owner, 90)
    INTO v_claimed;
  IF v_claimed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST FAILURE PATH CLAIM SHOULD SUCCEED';
  END IF;
  SELECT public.tc_release_route_estimate_reservation(repeat('e', 64), v_old_owner)
    INTO v_released;
  IF v_released IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST FAILURE PATH RELEASE SHOULD SUCCEED';
  END IF;
  SELECT public.tc_claim_route_estimate_reservation(repeat('e', 64), v_new_owner, 90)
    INTO v_claimed;
  IF v_claimed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST RETRY AFTER FAILURE SHOULD SUCCEED';
  END IF;

  -- Cache upsert is conditional on the current unexpired owner and is atomic with the reservation check.
  SELECT public.tc_store_route_estimate_if_owner(
    v_expired_key, v_old_owner, v_trip_id, 'drive', 'origin', 'destination', null,
    600, 1200, false, null, now() + interval '30 days'
  ) INTO v_stored;
  IF v_stored IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'TEST EXPIRED OLD OWNER MUST NOT WRITE CACHE';
  END IF;
  SELECT public.tc_store_route_estimate_if_owner(
    v_expired_key, v_new_owner, v_trip_id, 'drive', 'origin', 'destination', null,
    600, 1200, false, null, now() + interval '30 days'
  ) INTO v_stored;
  IF v_stored IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'TEST CURRENT OWNER SHOULD WRITE CACHE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.route_estimate_cache WHERE cache_key = v_expired_key) THEN
    RAISE EXCEPTION 'TEST CURRENT OWNER CACHE WRITE SHOULD EXIST';
  END IF;

  -- TTL validation must reject values too short or too long.
  BEGIN
    PERFORM public.tc_claim_route_estimate_reservation(repeat('d', 64), v_other_owner, 1);
    RAISE EXCEPTION 'TEST INVALID TTL SHOULD HAVE FAILED';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM = 'TEST INVALID TTL SHOULD HAVE FAILED' THEN RAISE; END IF;
  END;

  RAISE NOTICE 'PASS: exclusive same-key claim, independent keys, owner checks, conditional release and expired takeover.';
END $$;
ROLLBACK;
