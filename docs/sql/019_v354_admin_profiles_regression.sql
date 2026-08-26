-- Travel Companion V3.5.4 admin_profiles and Trip creation regression
--
-- Run through a privileged Supabase database connection after the V3.5.4
-- migration. The Trip fixture and profile update are rolled back.

begin;

create temporary table v354_results (
  role_name text not null,
  check_name text not null,
  passed boolean not null,
  detail text not null
) on commit drop;

grant all on table v354_results to authenticated;

do $$
declare
  super_id uuid;
  super_email text;
  ordinary_id uuid;
  ordinary_email text;
  matched_count integer;
  affected_count integer;
  duplicate_blocked boolean := false;
  fixture_trip_id text := 'free-travel-2099-12-31';
begin
  select users.id, lower(users.email)
  into super_id, super_email
  from auth.users as users
  join public.admin_users as admin
    on lower(admin.email) = lower(users.email)
   and admin.role = 'super_admin'
  where users.email is not null
  order by users.created_at
  limit 1;

  select users.id, lower(users.email)
  into ordinary_id, ordinary_email
  from auth.users as users
  where users.email is not null
    and not exists (
      select 1
      from public.admin_users as admin
      where lower(admin.email) = lower(users.email)
    )
  order by users.created_at
  limit 1;

  if super_id is null or ordinary_id is null then
    raise exception 'V3.5.4 regression requires one super admin and one no-role auth user';
  end if;

  if not exists (
    select 1
    from pg_class as relation
    join pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'admin_profiles'
      and relation.relrowsecurity
  ) then
    raise exception 'V3.5.4 regression failed: admin_profiles RLS is disabled';
  end if;

  if has_table_privilege('anon', 'public.admin_profiles', 'select')
    or has_table_privilege('anon', 'public.admin_profiles', 'insert')
    or has_table_privilege('anon', 'public.admin_profiles', 'update')
    or has_table_privilege('anon', 'public.admin_profiles', 'delete')
  then
    raise exception 'V3.5.4 regression failed: anon has admin_profiles privileges';
  end if;

  if not has_table_privilege('authenticated', 'public.admin_profiles', 'select')
    or not has_table_privilege('authenticated', 'public.admin_profiles', 'insert')
    or not has_table_privilege('authenticated', 'public.admin_profiles', 'update')
    or not has_table_privilege('authenticated', 'public.admin_profiles', 'delete')
  then
    raise exception 'V3.5.4 regression failed: authenticated grants are incomplete';
  end if;

  if exists (
    select 1
    from public.admin_users as admin
    join auth.users as users on lower(users.email) = lower(admin.email)
    where admin.role = 'super_admin'
      and not exists (
      select 1
      from public.admin_profiles as profile
      where profile.user_id = users.id
    )
  ) then
    raise exception 'V3.5.4 regression failed: a super admin profile is missing';
  end if;

  if exists (
    select 1
    from public.admin_profiles as profile
    join auth.users as users on users.id = profile.user_id
    where not exists (
      select 1
      from public.admin_users as admin
      where admin.role = 'super_admin'
        and lower(admin.email) = lower(users.email)
    )
  ) then
    raise exception 'V3.5.4 regression failed: a non-super-admin profile exists';
  end if;

  if not exists (
    select 1
    from public.admin_profiles
    where email = 'haw1971@gmail.com'
      and display_name = 'Howard'
      and sort_order = 0
      and include_in_new_trip
  ) or not exists (
    select 1
    from public.admin_profiles
    where email = 'carol1005@gmail.com'
      and display_name = 'Carol'
      and sort_order = 1
      and include_in_new_trip
  ) then
    raise exception 'V3.5.4 regression failed: fixed names or ordering are incorrect';
  end if;

  -- A normal authenticated user cannot read or maintain any profile.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', ordinary_id, 'email', ordinary_email)::text,
    true
  );
  execute 'set local role authenticated';
  select count(*) into matched_count from public.admin_profiles;
  insert into v354_results values (
    'user',
    'profiles hidden',
    matched_count = 0,
    'rows=' || matched_count
  );
  update public.admin_profiles set sort_order = sort_order;
  get diagnostics affected_count = row_count;
  insert into v354_results values (
    'user',
    'profile update blocked',
    affected_count = 0,
    'rows=' || affected_count
  );
  execute 'reset role';

  -- A super admin reads the ordered defaults and can maintain settings.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', super_id, 'email', super_email)::text,
    true
  );
  execute 'set local role authenticated';
  select count(*) into matched_count from public.admin_profiles;
  insert into v354_results values (
    'super_admin',
    'profiles visible',
    matched_count > 0,
    'rows=' || matched_count
  );
  update public.admin_profiles
  set sort_order = sort_order
  where user_id = super_id;
  get diagnostics affected_count = row_count;
  insert into v354_results values (
    'super_admin',
    'profile update allowed',
    affected_count = 1,
    'rows=' || affected_count
  );

  delete from public.trips where id = fixture_trip_id;
  insert into public.trips (id, title, departure_date)
  values (fixture_trip_id, 'V3.5.4 duplicate fixture', date '2099-12-31');

  begin
    insert into public.trips (id, title, departure_date)
    values (fixture_trip_id, 'V3.5.4 duplicate fixture 2', date '2099-12-31');
  exception
    when unique_violation then
      duplicate_blocked := true;
  end;

  insert into v354_results values (
    'super_admin',
    'duplicate Trip ID blocked',
    duplicate_blocked,
    'blocked=' || duplicate_blocked
  );
  execute 'reset role';
end;
$$;

do $$
begin
  if exists (select 1 from v354_results where not passed) then
    raise exception 'V3.5.4 admin_profiles regression failed';
  end if;
end;
$$;

select role_name, check_name, passed, detail
from v354_results
order by role_name, check_name;

rollback;
