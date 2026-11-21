begin;
insert into public.trips(id,title,departure_date,participants,currency_config,sidebar_config,content,created_by,is_public)
values('adr001-stage1-test-20261120','ADR001 test',current_date,'[]'::jsonb,'{"code":"JPY","symbol":"Y"}'::jsonb,'[]'::jsonb,'{"daysData":{"1":[]}}'::jsonb,'add36e1f-285d-4c0f-b3ac-16bafd89d083',false);
set local role authenticated;
set local request.jwt.claims='{"sub":"add36e1f-285d-4c0f-b3ac-16bafd89d083","email":"v391-admin@example.invalid","role":"authenticated"}';
select * from public.tc_claim_trip_itinerary_edit_lease('adr001-stage1-test-20261120','11111111-1111-4111-8111-111111111111');
select * from public.tc_save_trip_itinerary('adr001-stage1-test-20261120','11111111-1111-4111-8111-111111111111',0,'{"1":[{"id":"stage1-test"}]}');
select public.tc_read_trip_itinerary_version('adr001-stage1-test-20261120');
set local request.jwt.claims='{"sub":"e512dcb0-cc1c-47a5-84de-b1cc498abc41","email":"weather-rc-test-1@example.invalid","role":"authenticated"}';
select * from public.tc_claim_trip_itinerary_edit_lease('adr001-stage1-test-20261120','22222222-2222-4222-8222-222222222222');
select public.tc_renew_trip_itinerary_edit_lease('adr001-stage1-test-20261120','11111111-1111-4111-8111-111111111111');
select public.tc_release_trip_itinerary_edit_lease('adr001-stage1-test-20261120','11111111-1111-4111-8111-111111111111');
do $$ begin
 perform * from public.tc_save_trip_itinerary('adr001-stage1-test-20261120','22222222-2222-4222-8222-222222222222',1,'{"1":[{"id":"B-forged"}]}');
 raise exception 'B save unexpectedly succeeded';
 exception when insufficient_privilege then raise notice 'B_SAVE_DENIED_EXPECTED'; end $$;
set local request.jwt.claims='{"sub":"add36e1f-285d-4c0f-b3ac-16bafd89d083","email":"v391-admin@example.invalid","role":"authenticated"}';
do $$ begin
 update public.trips set content=jsonb_set(content,'{daysData}','{"1":[{"id":"forged"}]}') where id='adr001-stage1-test-20261120';
 raise exception 'direct daysData update unexpectedly succeeded';
 exception when insufficient_privilege then raise notice 'DIRECT_UPDATE_DENIED_EXPECTED'; end $$;
do $$ begin
 perform * from public.tc_save_trip_itinerary('adr001-stage1-test-20261120','11111111-1111-4111-8111-111111111111',0,'{"1":[{"id":"stale"}]}');
 raise exception 'stale CAS unexpectedly succeeded';
 exception when serialization_failure then raise notice 'STALE_VERSION_DENIED_EXPECTED'; end $$;
update public.trips set title='metadata-allowed' where id='adr001-stage1-test-20261120';
reset role;
select content->'daysData' from public.trips where id='adr001-stage1-test-20261120';
select count(*) as history_rows from private.itinerary_day_history where trip_id='adr001-stage1-test-20261120';
select count(*) as authorization_rows from private.tc_itinerary_save_authorizations where trip_id='adr001-stage1-test-20261120';
rollback;
