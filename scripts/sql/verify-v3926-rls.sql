-- V3.9.26 local-only role/RLS fixture. All changes roll back.
\set ON_ERROR_STOP on
begin;
insert into public.trips (id,title,departure_date,content,is_public)
values ('v3926-role-fixture','Private',current_date,'{}',false);
insert into public.admin_users(email,role,trip_id) values
('v3926-editor@example.invalid','trip_editor','v3926-role-fixture'),
('v3926-outsider@example.invalid','trip_editor','another-trip');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","email":"v3926-editor@example.invalid","role":"authenticated"}',true);
do $$
begin
 if not exists(select 1 from public.trips where id='v3926-role-fixture') then
  raise exception 'Invited editor cannot read private Trip';
 end if;
end $$;
update public.trips set title='Edited by authorized editor' where id='v3926-role-fixture';
do $$
begin
 if not exists(select 1 from public.trips where id='v3926-role-fixture' and title='Edited by authorized editor') then
  raise exception 'Invited editor cannot update private Trip';
 end if;
end $$;
savepoint visibility_guard;
-- Changing is_public must fail even when ordinary updates are allowed.
\set ON_ERROR_STOP off
update public.trips set is_public=true where id='v3926-role-fixture';
\set ON_ERROR_STOP on
rollback to savepoint visibility_guard;
do $$
begin
 if exists(select 1 from public.trips where id='v3926-role-fixture' and is_public) then
  raise exception 'Editor changed visibility';
 end if;
end $$;
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","email":"v3926-outsider@example.invalid","role":"authenticated"}',true);
do $$
begin
 if exists(select 1 from public.trips where id='v3926-role-fixture') then
  raise exception 'Uninvited editor can read private Trip';
 end if;
end $$;
reset role;
set local role anon;
do $$
begin
 if exists(select 1 from public.trips where id='v3926-role-fixture') then
  raise exception 'Guest can read private Trip';
 end if;
end $$;
reset role;
rollback;
\echo V3.9.26 local authorization fixture completed.
