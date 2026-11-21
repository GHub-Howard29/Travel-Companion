begin;
insert into public.trips(id,title,departure_date,participants,currency_config,sidebar_config,content,created_by,is_public)
values('adr001-stage1-rollback-20261120','ADR001 rollback test',current_date,'[]'::jsonb,'{"code":"JPY","symbol":"Y"}'::jsonb,'[]'::jsonb,'{"daysData":{"1":[]}}'::jsonb,'add36e1f-285d-4c0f-b3ac-16bafd89d083',false);
set local role authenticated;
set local request.jwt.claims='{"sub":"add36e1f-285d-4c0f-b3ac-16bafd89d083","email":"v391-admin@example.invalid","role":"authenticated"}';
select * from public.tc_claim_trip_itinerary_edit_lease('adr001-stage1-rollback-20261120','11111111-1111-4111-8111-111111111111');
reset role;
create function private.tc_adr001_test_fail_after() returns trigger language plpgsql as $$ begin if new.id='adr001-stage1-rollback-20261120' and old.content->'daysData' is distinct from new.content->'daysData' then raise exception 'TEST_FORCED_AFTER_TRIGGER_FAILURE';end if;return new;end $$;
create trigger tc_adr001_test_fail after update on public.trips for each row execute function private.tc_adr001_test_fail_after();
set local role authenticated;
set local request.jwt.claims='{"sub":"add36e1f-285d-4c0f-b3ac-16bafd89d083","email":"v391-admin@example.invalid","role":"authenticated"}';
do $$ begin
 perform * from public.tc_save_trip_itinerary('adr001-stage1-rollback-20261120','11111111-1111-4111-8111-111111111111',0,'{"1":[{"id":"rollback"}]}');
 raise exception 'Save unexpectedly succeeded';
 exception when others then if sqlerrm='Save unexpectedly succeeded' then raise; else raise notice 'SAVE_ROLLBACK_TRIGGER_FAILURE_CAUGHT';end if;end $$;
reset role;
select version from public.trip_itinerary_versions where trip_id='adr001-stage1-rollback-20261120';
select content->'daysData' from public.trips where id='adr001-stage1-rollback-20261120';
select count(*) from private.itinerary_day_history where trip_id='adr001-stage1-rollback-20261120';
select count(*) from private.tc_itinerary_save_authorizations where trip_id='adr001-stage1-rollback-20261120';
drop trigger tc_adr001_test_fail on public.trips;
drop function private.tc_adr001_test_fail_after();
rollback;
