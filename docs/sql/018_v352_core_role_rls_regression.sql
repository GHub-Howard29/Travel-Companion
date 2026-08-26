-- Travel Companion V3.5.2 core role/RLS regression
--
-- Run only through a privileged Supabase database connection after the V3.5.2
-- migration. All fixtures live inside this transaction and are rolled back.

begin;

create temporary table v352_role_results (
  role_name text not null,
  check_name text not null,
  passed boolean not null,
  detail text not null
) on commit drop;

grant all on table v352_role_results to anon, authenticated;

do $$
declare
  assigned_id uuid;
  assigned_email text;
  other_id uuid;
  other_email text;
  super_id uuid;
  super_email text;
  target_trip text := 'v352-role-regression-target';
  other_trip text := 'v352-role-regression-other';
  shared_checklist_id uuid;
  private_checklist_id uuid;
  matched_count integer;
  affected_count integer;
begin
  select users.id, lower(users.email)
  into assigned_id, assigned_email
  from auth.users as users
  where users.email is not null
    and not exists (
      select 1
      from public.admin_users as admin
      where lower(admin.email) = lower(users.email)
    )
  order by users.created_at
  limit 1;

  select users.id, lower(users.email)
  into other_id, other_email
  from auth.users as users
  where users.email is not null
    and users.id <> assigned_id
    and not exists (
      select 1
      from public.admin_users as admin
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

  if assigned_id is null or other_id is null or super_id is null then
    raise exception 'V3.5.2 regression requires two no-role auth users and one super admin';
  end if;

  insert into public.admin_users (email, role, trip_id)
  values
    (assigned_email, 'trip_editor', target_trip),
    (other_email, 'trip_editor', other_trip);

  insert into public.trips (id, title, departure_date)
  values
    (target_trip, 'V3.5.2 target fixture', current_date),
    (other_trip, 'V3.5.2 other fixture', current_date + 1);

  insert into public.checklists (trip_id, scope, title)
  values (target_trip, 'shared', 'V3.5.2 shared fixture')
  returning id into shared_checklist_id;

  insert into public.checklists (
    trip_id, scope, owner_user_id, title, created_by
  )
  values (
    target_trip, 'private', assigned_id, 'V3.5.2 private fixture', assigned_id
  )
  returning id into private_checklist_id;

  insert into public.checklist_items (
    checklist_id, client_item_id, label, created_by
  )
  values
    (shared_checklist_id, 'v352-shared-item', 'shared', assigned_id),
    (private_checklist_id, 'v352-private-item', 'private', assigned_id);

  insert into public.other_info_items (
    trip_id, client_item_id, folder_id, title, content, allowed_roles, created_by
  )
  values
    (target_trip, 'v352-general', 'other', 'general', 'general', null, assigned_id),
    (
      target_trip,
      'v352-sensitive',
      'other',
      'sensitive',
      'sensitive',
      array['trip_editor', 'super_admin']::text[],
      assigned_id
    );

  insert into public.exchange_purchases (
    trip_id,
    client_item_id,
    foreign_currency,
    purchase_date,
    twd_amount,
    foreign_amount,
    created_by
  )
  values (
    target_trip, 'v352-exchange', 'JPY', current_date, 100, 500, assigned_id
  );

  -- Guest: public Trip/shared data and general Other Info remain readable.
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  select count(*) into matched_count
  from public.trips where id = target_trip;
  insert into v352_role_results values ('guest', 'trip read', matched_count = 1, 'rows=' || matched_count);
  select count(*) into matched_count
  from public.checklists where trip_id = target_trip;
  insert into v352_role_results values ('guest', 'shared checklist only', matched_count = 1, 'rows=' || matched_count);
  select count(*) into matched_count
  from public.checklist_items where checklist_id in (shared_checklist_id, private_checklist_id);
  insert into v352_role_results values ('guest', 'shared checklist item only', matched_count = 1, 'rows=' || matched_count);
  select count(*) into matched_count
  from public.other_info_items where trip_id = target_trip;
  insert into v352_role_results values ('guest', 'general other info only', matched_count = 1, 'rows=' || matched_count);
  insert into v352_role_results values (
    'guest',
    'role helpers false',
    not public.tc_is_super_admin() and not public.tc_is_trip_editor(target_trip),
    'helper result'
  );
  execute 'reset role';

  -- Signed-in user / editor assigned to another Trip: target Trip remains read-only.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', other_id, 'email', other_email)::text,
    true
  );
  execute 'set local role authenticated';
  select count(*) into matched_count
  from public.other_info_items where trip_id = target_trip;
  insert into v352_role_results values ('other_trip_editor', 'general other info only', matched_count = 1, 'rows=' || matched_count);
  select count(*) into matched_count
  from public.exchange_purchases where trip_id = target_trip;
  insert into v352_role_results values ('other_trip_editor', 'exchange hidden', matched_count = 0, 'rows=' || matched_count);
  insert into v352_role_results values (
    'other_trip_editor',
    'Trip scope helper',
    not public.tc_is_trip_editor(target_trip) and public.tc_is_trip_editor(other_trip),
    'helper result'
  );
  execute 'reset role';

  -- Assigned editor: shared/private own data, sensitive info and cloud exchange remain available.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', assigned_id, 'email', assigned_email)::text,
    true
  );
  execute 'set local role authenticated';
  select count(*) into matched_count
  from public.checklists where trip_id = target_trip;
  insert into v352_role_results values ('assigned_trip_editor', 'shared and own private checklist', matched_count = 2, 'rows=' || matched_count);
  select count(*) into matched_count
  from public.other_info_items where trip_id = target_trip;
  insert into v352_role_results values ('assigned_trip_editor', 'general and sensitive other info', matched_count = 2, 'rows=' || matched_count);
  select count(*) into matched_count
  from public.exchange_purchases where trip_id = target_trip;
  insert into v352_role_results values ('assigned_trip_editor', 'exchange visible', matched_count = 1, 'rows=' || matched_count);
  update public.checklists
  set title = 'V3.5.2 shared fixture updated'
  where id = shared_checklist_id;
  get diagnostics affected_count = row_count;
  insert into v352_role_results values ('assigned_trip_editor', 'triggered checklist update', affected_count = 1, 'rows=' || affected_count);
  execute 'reset role';

  -- Super admin keeps global management but cannot read another user's private checklist.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', super_id, 'email', super_email)::text,
    true
  );
  execute 'set local role authenticated';
  select count(*) into matched_count
  from public.checklists where trip_id = target_trip;
  insert into v352_role_results values ('super_admin', 'shared checklist only', matched_count = 1, 'rows=' || matched_count);
  select count(*) into matched_count
  from public.other_info_items where trip_id = target_trip;
  insert into v352_role_results values ('super_admin', 'general and sensitive other info', matched_count = 2, 'rows=' || matched_count);
  select count(*) into matched_count
  from public.exchange_purchases where trip_id = target_trip;
  insert into v352_role_results values ('super_admin', 'exchange visible', matched_count = 1, 'rows=' || matched_count);
  insert into v352_role_results values (
    'super_admin',
    'global helper',
    public.tc_is_super_admin() and public.tc_is_trip_editor(other_trip) = false,
    'helper result'
  );
  execute 'reset role';
end;
$$;

do $$
begin
  if exists (select 1 from v352_role_results where not passed) then
    raise exception 'V3.5.2 core role/RLS regression failed';
  end if;
end;
$$;

select role_name, check_name, passed, detail
from v352_role_results
order by role_name, check_name;

rollback;
