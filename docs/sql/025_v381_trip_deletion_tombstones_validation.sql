-- V3.8.1 Trip tombstone, protected seed and atomic deletion validation.
-- Run through a privileged connection after applying the V3.8.1 migration.
-- All fixtures, tombstones, revisions and Broadcast messages are rolled back.

begin;

create temporary table v381_results (
  check_name text not null,
  passed boolean not null,
  detail text not null
) on commit drop;
grant all on table v381_results to authenticated;

do $$
declare
  super_admin_id uuid;
  super_admin_email text;
  fixture_trip_id text := 'trip-38138138-1381-4381-8381-381381381381';
  rollback_trip_id text := 'trip-38138138-2381-4381-8381-381381381381';
  deleted_id text;
  deleted_revision bigint;
  before_revision bigint;
  tombstone_count integer;
  protected_error boolean := false;
  protected_direct_delete_error boolean := false;
  resurrection_error boolean := false;
  zero_row_error boolean := false;
  rollback_error boolean := false;
  cleanup_count integer;
  retained_private_count integer;
begin
  select app_user.id, lower(app_user.email)
  into super_admin_id, super_admin_email
  from auth.users as app_user
  join public.admin_users as manager
    on manager.email = lower(app_user.email)
   and manager.role = 'super_admin'
  where app_user.email is not null
  order by app_user.created_at
  limit 1;

  if super_admin_id is null then
    raise exception 'V3.8.1 validation requires one Auth-backed super_admin';
  end if;

  insert into public.trips (id, title, departure_date, content)
  values (
    fixture_trip_id,
    'V3.8.1 deletion fixture',
    current_date,
    '{"days":[1]}'::jsonb
  );

  insert into public.checklists (trip_id, scope, owner_user_id, title) values
    (fixture_trip_id, 'shared', null, 'shared deletion fixture'),
    (fixture_trip_id, 'private', super_admin_id, 'private retention fixture');
  insert into public.other_info_items (trip_id, title)
  values (fixture_trip_id, 'other info deletion fixture');
  insert into public.exchange_purchases (trip_id, client_item_id)
  values (fixture_trip_id, 'v381-exchange-fixture');
  insert into public.expenses (trip_id, description)
  values (fixture_trip_id, 'expense deletion fixture');
  insert into public.admin_users (email, role, trip_id)
  values ('v381-editor@example.invalid', 'trip_editor', fixture_trip_id);

  select revision into before_revision
  from public.app_data_revision where singleton;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object(
      'sub', super_admin_id,
      'email', super_admin_email
    )::text,
    true
  );

  execute 'set local role authenticated';
  select result.deleted_trip_id, result.deletion_revision
  into deleted_id, deleted_revision
  from public.tc_delete_trip(fixture_trip_id) as result;
  execute 'reset role';

  insert into v381_results values (
    'RPC deletes exactly one Trip and returns its tombstone revision',
    deleted_id = fixture_trip_id and deleted_revision > before_revision,
    'id=' || coalesce(deleted_id, 'null') || ', revision=' || coalesce(deleted_revision::text, 'null')
  );

  select count(*) into tombstone_count
  from public.trip_deletion_tombstones
  where trip_id = fixture_trip_id
    and deletion_revision = deleted_revision;

  insert into v381_results values (
    'Trip deletion creates one matching tombstone in the same transaction',
    tombstone_count = 1,
    'matched=' || tombstone_count
  );

  select
    (select count(*) from public.checklists where trip_id = fixture_trip_id and scope = 'shared')
    + (select count(*) from public.other_info_items where trip_id = fixture_trip_id)
    + (select count(*) from public.exchange_purchases where trip_id = fixture_trip_id)
    + (select count(*) from public.expenses where trip_id = fixture_trip_id)
    + (select count(*) from public.admin_users where trip_id = fixture_trip_id)
  into cleanup_count;
  select count(*) into retained_private_count
  from public.checklists
  where trip_id = fixture_trip_id and scope = 'private';

  insert into v381_results values (
    'RPC atomically removes shared relations and retains private checklist data',
    cleanup_count = 0 and retained_private_count = 1,
    'remaining shared=' || cleanup_count || ', retained private=' || retained_private_count
  );

  begin
    insert into public.trips (id, title, departure_date, content)
    values (
      fixture_trip_id,
      'V3.8.1 resurrection attempt',
      current_date,
      '{"days":[1]}'::jsonb
    );
  exception
    when unique_violation then
      resurrection_error := true;
  end;

  insert into v381_results values (
    'tombstoned Trip ID cannot be recreated',
    resurrection_error,
    case when resurrection_error then 'unique_violation' else 'insert unexpectedly succeeded' end
  );

  execute 'set local role authenticated';
  begin
    perform * from public.tc_delete_trip('free-travel-2026-01');
  exception
    when sqlstate 'P0001' then
      protected_error := true;
  end;
  execute 'reset role';

  insert into v381_results values (
    'protected seed Trip is rejected by the deletion RPC',
    protected_error,
    case when protected_error then 'P0001' else 'delete unexpectedly allowed' end
  );

  execute 'set local role authenticated';
  begin
    perform * from public.tc_delete_trip('trip-does-not-exist');
  exception
    when no_data_found then
      zero_row_error := true;
  end;
  execute 'reset role';

  insert into v381_results values (
    'zero-row deletion is rejected',
    zero_row_error,
    case when zero_row_error then 'no_data_found' else 'missing Trip unexpectedly succeeded' end
  );

  insert into public.trips (id, title, departure_date, content)
  values (rollback_trip_id, 'rollback fixture', current_date, '{"days":[1]}'::jsonb);
  insert into public.other_info_items (trip_id, title)
  values (rollback_trip_id, 'must survive failed transaction');
  insert into public.trip_deletion_tombstones (trip_id, deletion_revision)
  values (rollback_trip_id, 999999);

  execute 'set local role authenticated';
  begin
    perform * from public.tc_delete_trip(rollback_trip_id);
  exception
    when unique_violation then
      rollback_error := true;
  end;
  execute 'reset role';

  insert into v381_results values (
    'duplicate tombstone rolls back Trip and relation deletion',
    rollback_error
      and exists (select 1 from public.trips where id = rollback_trip_id)
      and exists (select 1 from public.other_info_items where trip_id = rollback_trip_id)
      and (select count(*) from public.trip_deletion_tombstones where trip_id = rollback_trip_id) = 1,
    case when rollback_error then 'unique_violation and rows retained' else 'delete unexpectedly succeeded' end
  );

  begin
    delete from public.trips where id = 'free-travel-2026-01';
  exception
    when sqlstate 'P0001' then
      protected_direct_delete_error := true;
  end;

  insert into v381_results values (
    'protected seed Trip is rejected by privileged direct DELETE',
    protected_direct_delete_error,
    case when protected_direct_delete_error then 'P0001' else 'delete unexpectedly allowed' end
  );
end;
$$;

do $$
declare
  super_admin_id uuid;
  super_admin_email text;
  ordinary_id uuid := '38138138-3381-4381-8381-381381381381';
  editor_id uuid := '38138138-4381-4381-8381-381381381381';
  readable boolean;
  write_blocked boolean;
  rpc_blocked boolean;
begin
  select app_user.id, lower(app_user.email)
  into super_admin_id, super_admin_email
  from auth.users as app_user
  join public.admin_users as manager
    on manager.email = lower(app_user.email)
   and manager.role = 'super_admin'
  order by app_user.created_at
  limit 1;

  insert into auth.users (id, email, created_at, updated_at)
  values
    (ordinary_id, 'v381-role-user@example.invalid', now(), now()),
    (editor_id, 'v381-role-editor@example.invalid', now(), now());
  insert into public.admin_users (email, role, trip_id)
  values ('v381-role-editor@example.invalid', 'trip_editor', 'group-tour-2026-10');

  write_blocked := false;
  rpc_blocked := false;
  execute 'set local role anon';
  select exists (select 1 from public.trip_deletion_tombstones) into readable;
  begin
    insert into public.trip_deletion_tombstones (trip_id, deletion_revision)
    values ('anon-write-attempt', 1);
  exception when insufficient_privilege then write_blocked := true;
  end;
  begin
    perform * from public.tc_delete_trip('group-tour-2026-10');
  exception when insufficient_privilege then rpc_blocked := true;
  end;
  execute 'reset role';
  insert into v381_results values (
    'Guest reads tombstones but cannot write or call deletion RPC',
    readable and write_blocked and rpc_blocked,
    'read=' || readable || ', write blocked=' || write_blocked || ', RPC blocked=' || rpc_blocked
  );

  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', ordinary_id,
    'email', 'v381-role-user@example.invalid'
  )::text, true);
  write_blocked := false;
  rpc_blocked := false;
  execute 'set local role authenticated';
  select exists (select 1 from public.trip_deletion_tombstones) into readable;
  begin
    update public.trip_deletion_tombstones set deletion_revision = deletion_revision;
  exception when insufficient_privilege then write_blocked := true;
  end;
  begin
    perform * from public.tc_delete_trip('group-tour-2026-10');
  exception when insufficient_privilege then rpc_blocked := true;
  end;
  execute 'reset role';
  insert into v381_results values (
    'User reads tombstones but cannot write or delete Trips',
    readable and write_blocked and rpc_blocked,
    'read=' || readable || ', write blocked=' || write_blocked || ', RPC blocked=' || rpc_blocked
  );

  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', editor_id,
    'email', 'v381-role-editor@example.invalid'
  )::text, true);
  write_blocked := false;
  rpc_blocked := false;
  execute 'set local role authenticated';
  select exists (select 1 from public.trip_deletion_tombstones) into readable;
  begin
    delete from public.trip_deletion_tombstones;
  exception when insufficient_privilege then write_blocked := true;
  end;
  begin
    perform * from public.tc_delete_trip('group-tour-2026-10');
  exception when insufficient_privilege then rpc_blocked := true;
  end;
  execute 'reset role';
  insert into v381_results values (
    'trip_editor reads tombstones but cannot write or delete Trips',
    readable and write_blocked and rpc_blocked,
    'read=' || readable || ', write blocked=' || write_blocked || ', RPC blocked=' || rpc_blocked
  );

  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', super_admin_id,
    'email', super_admin_email
  )::text, true);
  write_blocked := false;
  execute 'set local role authenticated';
  select exists (select 1 from public.trip_deletion_tombstones) into readable;
  begin
    delete from public.trip_deletion_tombstones;
  exception when insufficient_privilege then write_blocked := true;
  end;
  execute 'reset role';
  insert into v381_results values (
    'super_admin reads tombstones but cannot write them directly',
    readable and write_blocked,
    'read=' || readable || ', write blocked=' || write_blocked
  );
end;
$$;

insert into v381_results
select
  'tombstone table has RLS and the required columns',
  table_info.relrowsecurity
    and count(column_info.column_name) = 3,
  'columns=' || count(column_info.column_name) || ', rls=' || table_info.relrowsecurity
from pg_class as table_info
join pg_namespace as schema_info on schema_info.oid = table_info.relnamespace
join information_schema.columns as column_info
  on column_info.table_schema = schema_info.nspname
 and column_info.table_name = table_info.relname
where schema_info.nspname = 'public'
  and table_info.relname = 'trip_deletion_tombstones'
  and column_info.column_name in ('trip_id', 'deleted_at', 'deletion_revision')
group by table_info.relrowsecurity;

insert into v381_results
select
  'browser roles have read-only tombstone grants',
  has_table_privilege('anon', 'public.trip_deletion_tombstones', 'SELECT')
    and has_table_privilege('authenticated', 'public.trip_deletion_tombstones', 'SELECT')
    and not has_table_privilege('anon', 'public.trip_deletion_tombstones', 'INSERT,UPDATE,DELETE')
    and not has_table_privilege('authenticated', 'public.trip_deletion_tombstones', 'INSERT,UPDATE,DELETE'),
  'least privilege';

insert into v381_results
select
  'only authenticated can execute the deletion RPC',
  has_function_privilege('authenticated', 'public.tc_delete_trip(text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.tc_delete_trip(text)', 'EXECUTE')
    and not has_function_privilege('public', 'public.tc_delete_trip(text)', 'EXECUTE'),
  'execute grants';

insert into v381_results
select
  'browser roles cannot bypass the deletion RPC with direct DELETE',
  not has_table_privilege('anon', 'public.trips', 'DELETE')
    and not has_table_privilege('authenticated', 'public.trips', 'DELETE'),
  'direct DELETE revoked';

insert into v381_results
select
  'defense-in-depth triggers are installed',
  count(*) = 2,
  'matched=' || count(*)
from pg_trigger
where not tgisinternal
  and tgname in (
    'trips_reject_protected_seed_delete',
    'trips_reject_tombstoned_id_insert'
  );

do $$
begin
  if exists (select 1 from v381_results where not passed) then
    raise exception 'V3.8.1 Trip deletion validation failed';
  end if;
end;
$$;

select check_name, passed, detail
from v381_results
order by check_name;

rollback;
