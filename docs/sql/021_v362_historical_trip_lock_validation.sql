-- V3.6.2 historical Trip lock validation
--
-- Run only through a privileged Supabase database connection after applying
-- 20260901064451_v362_historical_trip_write_lock.sql. Fixtures are rolled back.

begin;

create temporary table v362_results (
  check_name text not null,
  passed boolean not null,
  detail text not null
) on commit drop;
grant all on table v362_results to authenticated;

do $$
declare
  editor_id uuid;
  editor_email text;
  super_id uuid;
  super_email text;
  past_trip text := 'v362-history-past-fixture';
  active_trip text := 'v362-history-active-fixture';
  past_shared_id uuid;
  active_shared_id uuid;
  private_id uuid;
  affected_count integer;
begin
  select users.id, lower(users.email)
  into editor_id, editor_email
  from auth.users as users
  where users.email is not null
    and not exists (
      select 1 from public.admin_users as admin
      where lower(admin.email) = lower(users.email)
    )
  order by users.created_at
  limit 1;

  select users.id, lower(users.email)
  into super_id, super_email
  from auth.users as users
  join public.admin_users as admin
    on lower(admin.email) = lower(users.email)
   and admin.role = 'super_admin'
  order by users.created_at
  limit 1;

  if editor_id is null or super_id is null then
    raise exception 'V3.6.2 validation requires one no-role auth user and one super admin';
  end if;

  insert into public.trips (id, title, departure_date, content)
  values
    (
      past_trip,
      'V3.6.2 past fixture',
      (now() at time zone 'Asia/Taipei')::date - 2,
      '{"days":[1]}'::jsonb
    ),
    (
      active_trip,
      'V3.6.2 active fixture',
      (now() at time zone 'Asia/Taipei')::date,
      '{"days":[1]}'::jsonb
    );

  insert into public.admin_users (email, role, trip_id)
  values
    (editor_email, 'trip_editor', past_trip),
    (editor_email, 'trip_editor', active_trip);

  insert into public.checklists (trip_id, scope, title)
  values (past_trip, 'shared', 'past shared') returning id into past_shared_id;
  insert into public.checklists (trip_id, scope, title)
  values (active_trip, 'shared', 'active shared') returning id into active_shared_id;
  insert into public.checklists (
    trip_id, scope, owner_user_id, title, created_by
  ) values (
    past_trip, 'private', editor_id, 'past private', editor_id
  ) returning id into private_id;

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', editor_id, 'email', editor_email)::text,
    true
  );
  execute 'set local role authenticated';

  insert into v362_results values (
    'trip_editor helper rejects historical Trip',
    not public.tc_can_write_shared_trip(past_trip),
    'past=' || public.tc_can_write_shared_trip(past_trip)
  );
  insert into v362_results values (
    'trip_editor helper allows final Taiwan day',
    public.tc_can_write_shared_trip(active_trip),
    'active=' || public.tc_can_write_shared_trip(active_trip)
  );

  update public.trips set title = 'blocked' where id = past_trip;
  get diagnostics affected_count = row_count;
  insert into v362_results values (
    'trip_editor historical Trip update blocked',
    affected_count = 0,
    'rows=' || affected_count
  );

  update public.trips set title = 'allowed' where id = active_trip;
  get diagnostics affected_count = row_count;
  insert into v362_results values (
    'trip_editor active Trip update allowed',
    affected_count = 1,
    'rows=' || affected_count
  );

  update public.checklists set title = 'blocked' where id = past_shared_id;
  get diagnostics affected_count = row_count;
  insert into v362_results values (
    'trip_editor historical shared checklist blocked',
    affected_count = 0,
    'rows=' || affected_count
  );

  update public.checklists set title = 'allowed' where id = active_shared_id;
  get diagnostics affected_count = row_count;
  insert into v362_results values (
    'trip_editor active shared checklist allowed',
    affected_count = 1,
    'rows=' || affected_count
  );

  update public.checklists set title = 'private still allowed' where id = private_id;
  get diagnostics affected_count = row_count;
  insert into v362_results values (
    'private checklist rule unchanged',
    affected_count = 1,
    'rows=' || affected_count
  );

  execute 'reset role';
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', super_id, 'email', super_email)::text,
    true
  );
  execute 'set local role authenticated';
  update public.trips set title = 'admin allowed' where id = past_trip;
  get diagnostics affected_count = row_count;
  insert into v362_results values (
    'super_admin historical Trip update allowed',
    affected_count = 1,
    'rows=' || affected_count
  );
  execute 'reset role';
end;
$$;

insert into v362_results
select
  'required write policies use historical helper',
  count(*) = 10,
  'matched=' || count(*)
from pg_policies
where (
    (
      schemaname = 'public'
      and (tablename, policyname) in (
        ('trips', 'trips_update_policy'),
        ('expenses', 'expenses_insert_policy'),
        ('expenses', 'expenses_update_policy'),
        ('expenses', 'expenses_delete_policy'),
        ('exchange_purchases', 'exchange_purchases_insert_policy'),
        ('exchange_purchases', 'exchange_purchases_update_policy'),
        ('exchange_purchases', 'exchange_purchases_delete_policy')
      )
    )
    or (
      schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'expense_attachments_insert_v351',
        'expense_attachments_update_v351',
        'expense_attachments_delete_v351'
      )
    )
  )
  and (
    coalesce(qual, '') like '%tc_can_write_shared_trip%'
    or coalesce(with_check, '') like '%tc_can_write_shared_trip%'
  );

do $$
begin
  if exists (select 1 from v362_results where not passed) then
    raise exception 'V3.6.2 historical Trip lock validation failed';
  end if;
end;
$$;

select check_name, passed, detail
from v362_results
order by check_name;

rollback;
