-- V3.6.4 Trip data revision and private Broadcast validation.
-- Run through a privileged connection after applying the V3.6.4 migration.
-- All fixtures and emitted test messages are rolled back.

begin;

create temporary table v364_results (
  check_name text not null,
  passed boolean not null,
  detail text not null
) on commit drop;
grant all on table v364_results to authenticated;

do $$
declare
  no_role_id uuid;
  no_role_email text;
  starting_revision bigint;
  current_revision bigint;
  visible_count integer;
  fixture_trip text := 'v364-revision-fixture';
  fixture_client uuid := '36436436-4364-4364-8364-364364364364';
begin
  select users.id, lower(users.email)
  into no_role_id, no_role_email
  from auth.users as users
  where users.email is not null
    and not exists (
      select 1 from public.admin_users as manager
      where manager.email = lower(users.email)
    )
  order by users.created_at
  limit 1;

  if no_role_id is null then
    raise exception 'V3.6.4 validation requires one authenticated no-role user';
  end if;

  select revision into starting_revision
  from public.app_data_revision where singleton;

  perform set_config(
    'request.headers',
    jsonb_build_object(
      'x-travel-companion-client-id', fixture_client::text
    )::text,
    true
  );
  insert into public.trips (id, title, departure_date, content)
  values (fixture_trip, 'V3.6.4 fixture', current_date, '{"days":[1]}'::jsonb);

  select revision into current_revision
  from public.app_data_revision where singleton;
  insert into v364_results values (
    'Trip insert increments exactly once',
    current_revision = starting_revision + 1,
    'before=' || starting_revision || ', after=' || current_revision
  );
  insert into v364_results
  select
    'source client id captured from request header',
    source_client_id = fixture_client,
    coalesce(source_client_id::text, 'null')
  from public.app_data_revision where singleton;

  update public.trips
  set content = jsonb_set(content, '{checklistData}', '[]'::jsonb, true)
  where id = fixture_trip;
  insert into v364_results
  select
    'shared checklist-only Trip compatibility write is excluded',
    revision = current_revision,
    'revision=' || revision
  from public.app_data_revision where singleton;

  update public.trips
  set content = jsonb_set(content, '{otherInfoItems}', '[]'::jsonb, true)
  where id = fixture_trip;
  insert into v364_results
  select
    'Other Info-only Trip compatibility write is excluded',
    revision = current_revision,
    'revision=' || revision
  from public.app_data_revision where singleton;

  update public.trips
  set title = 'V3.6.4 fixture updated'
  where id = fixture_trip;
  insert into v364_results
  select
    'Trip master update increments revision',
    revision = current_revision + 1,
    'before=' || current_revision || ', after=' || revision
  from public.app_data_revision where singleton;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', no_role_id, 'email', no_role_email)::text,
    true
  );
  execute 'set local role authenticated';
  select count(*) into visible_count from public.app_data_revision;
  insert into v364_results values (
    'authenticated user without management role cannot read revision',
    visible_count = 0,
    'rows=' || visible_count
  );
  execute 'reset role';

  insert into public.admin_users (email, role, trip_id)
  values (no_role_email, 'trip_editor', fixture_trip);

  execute 'set local role authenticated';
  select count(*) into visible_count from public.app_data_revision;
  insert into v364_results values (
    'assigned trip_editor can read singleton revision',
    visible_count = 1,
    'rows=' || visible_count
  );
  execute 'reset role';
end;
$$;

insert into v364_results
select
  'required triggers installed',
  count(*) = 6,
  'matched=' || count(*)
from pg_trigger
where not tgisinternal
  and tgname in (
    'trips_broadcast_data_revision_insert',
    'trips_broadcast_data_revision_update',
    'trips_broadcast_data_revision_delete',
    'admin_users_broadcast_trip_editor_insert',
    'admin_users_broadcast_trip_editor_update',
    'admin_users_broadcast_trip_editor_delete'
  );

insert into v364_results
select
  'private Broadcast has receive-only policy',
  count(*) = 1
    and bool_and(cmd = 'SELECT')
    and bool_and(coalesce(qual, '') like '%travel-companion:data-revision:%')
    and bool_and(coalesce(qual, '') like '%broadcast%'),
  'matched=' || count(*)
from pg_policies
where schemaname = 'realtime'
  and tablename = 'messages'
  and policyname = 'app_data_revision_receive_broadcast';

insert into v364_results
select
  'browser roles cannot execute internal trigger functions',
  not has_function_privilege('anon', 'private.tc_broadcast_trip_data_revision()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.tc_broadcast_trip_data_revision()', 'EXECUTE')
    and not has_function_privilege('anon', 'private.tc_request_source_client_id()', 'EXECUTE')
    and not has_function_privilege('authenticated', 'private.tc_request_source_client_id()', 'EXECUTE'),
  'least privilege'
;

do $$
begin
  if exists (select 1 from v364_results where not passed) then
    raise exception 'V3.6.4 Trip data revision validation failed';
  end if;
end;
$$;

select check_name, passed, detail
from v364_results
order by check_name;

rollback;
