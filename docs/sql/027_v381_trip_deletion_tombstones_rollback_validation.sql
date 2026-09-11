-- Assert that a test-environment V3.8.1 rollback removed only V3.8.1 objects
-- and restored the pre-V3.8.1 Trip deletion path.

do $$
begin
  if to_regclass('public.trip_deletion_tombstones') is not null then
    raise exception 'rollback left public.trip_deletion_tombstones installed';
  end if;

  if to_regprocedure('public.tc_delete_trip(text)') is not null
    or to_regprocedure('private.tc_reject_tombstoned_trip_insert()') is not null
    or to_regprocedure('private.tc_reject_protected_trip_delete()') is not null
    or to_regprocedure('private.tc_is_protected_seed_trip_id(text)') is not null
  then
    raise exception 'rollback left a V3.8.1 function installed';
  end if;

  if exists (
    select 1 from pg_trigger
    where not tgisinternal
      and tgname in (
        'trips_reject_protected_seed_delete',
        'trips_reject_tombstoned_id_insert'
      )
  ) then
    raise exception 'rollback left a V3.8.1 trigger installed';
  end if;

  if not has_table_privilege('authenticated', 'public.trips', 'DELETE') then
    raise exception 'rollback did not restore authenticated Trip DELETE grant';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'trips'
      and policyname = 'trips_delete_policy'
  ) then
    raise exception 'rollback did not restore trips_delete_policy';
  end if;

  if to_regprocedure('private.tc_broadcast_trip_data_revision()') is null
    or to_regclass('public.app_data_revision') is null
  then
    raise exception 'rollback removed the pre-existing V3.6.4 revision layer';
  end if;
end;
$$;

select 'V3.8.1 rollback validation passed' as result;
