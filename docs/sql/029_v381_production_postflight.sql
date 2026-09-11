-- V3.8.1 production-safe postflight validation.
--
-- Read-only: this script inspects catalog metadata, privileges and the two
-- protected seed rows. It does not call tc_delete_trip or mutate any data.

with checks (check_name, passed, detail) as (
  values
    (
      'tombstone table exists with exactly the minimal columns',
      to_regclass('public.trip_deletion_tombstones') is not null
        and (
          select count(*) = 3
            and count(*) filter (
              where column_name in ('trip_id', 'deleted_at', 'deletion_revision')
            ) = 3
          from information_schema.columns
          where table_schema = 'public'
            and table_name = 'trip_deletion_tombstones'
        ),
      'trip_id, deleted_at, deletion_revision only'
    ),
    (
      'tombstone table has RLS enabled',
      coalesce((
        select relation.relrowsecurity
        from pg_class as relation
        join pg_namespace as relation_schema
          on relation_schema.oid = relation.relnamespace
        where relation_schema.nspname = 'public'
          and relation.relname = 'trip_deletion_tombstones'
      ), false),
      'relrowsecurity=true'
    ),
    (
      'tombstone SELECT policy exists for browser roles',
      exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'trip_deletion_tombstones'
          and policyname = 'trip_deletion_tombstones_select_policy'
          and cmd = 'SELECT'
          and roles::text like '%anon%'
          and roles::text like '%authenticated%'
      ),
      'anon and authenticated SELECT policy'
    ),
    (
      'browser roles have read-only tombstone grants',
      has_table_privilege('anon', 'public.trip_deletion_tombstones', 'SELECT')
        and has_table_privilege(
          'authenticated',
          'public.trip_deletion_tombstones',
          'SELECT'
        )
        and not has_table_privilege(
          'anon',
          'public.trip_deletion_tombstones',
          'INSERT,UPDATE,DELETE'
        )
        and not has_table_privilege(
          'authenticated',
          'public.trip_deletion_tombstones',
          'INSERT,UPDATE,DELETE'
        ),
      'SELECT only'
    ),
    (
      'only authenticated can execute the deletion RPC',
      to_regprocedure('public.tc_delete_trip(text)') is not null
        and has_function_privilege(
          'authenticated',
          'public.tc_delete_trip(text)',
          'EXECUTE'
        )
        and not has_function_privilege(
          'anon',
          'public.tc_delete_trip(text)',
          'EXECUTE'
        )
        and not has_function_privilege(
          'public',
          'public.tc_delete_trip(text)',
          'EXECUTE'
        )
        and not has_function_privilege(
          'service_role',
          'public.tc_delete_trip(text)',
          'EXECUTE'
        ),
      'authenticated EXECUTE only'
    ),
    (
      'deletion RPC is hardened',
      exists (
        select 1
        from pg_proc as routine
        where routine.oid = to_regprocedure('public.tc_delete_trip(text)')
          and routine.prosecdef
          and array_to_string(routine.proconfig, ',') like '%search_path=%'
      ),
      'SECURITY DEFINER with fixed search_path'
    ),
    (
      'browser roles cannot bypass the deletion RPC',
      not has_table_privilege('anon', 'public.trips', 'DELETE')
        and not has_table_privilege('authenticated', 'public.trips', 'DELETE')
        and not exists (
          select 1
          from pg_policies
          where schemaname = 'public'
            and tablename = 'trips'
            and policyname = 'trips_delete_policy'
        ),
      'direct DELETE revoked and old policy absent'
    ),
    (
      'defense-in-depth triggers are installed and enabled',
      (
        select count(*) = 2
        from pg_trigger
        where not tgisinternal
          and tgenabled <> 'D'
          and tgname in (
            'trips_reject_protected_seed_delete',
            'trips_reject_tombstoned_id_insert'
          )
      ),
      'protected-delete and tombstoned-insert triggers'
    ),
    (
      'Trip deletion revision trigger remains installed',
      exists (
        select 1
        from pg_trigger
        where not tgisinternal
          and tgenabled <> 'D'
          and tgname = 'trips_broadcast_data_revision_delete'
      ),
      'authoritative tombstone revision path'
    ),
    (
      'both protected seed Trips still exist',
      (
        select count(*) = 2
        from public.trips
        where id in ('free-travel-2026-01', 'group-tour-2026-10')
      ),
      'free-travel-2026-01 and group-tour-2026-10'
    )
)
select
  check_name,
  passed,
  detail
from checks
order by check_name;
