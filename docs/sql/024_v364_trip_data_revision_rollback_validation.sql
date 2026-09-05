-- Assert that the V3.6.4 rollback removed only the V3.6.4 database layer.

do $$
begin
  if to_regclass('public.app_data_revision') is not null then
    raise exception 'rollback left public.app_data_revision installed';
  end if;

  if to_regprocedure('private.tc_broadcast_trip_data_revision()') is not null
    or to_regprocedure('private.tc_request_source_client_id()') is not null
  then
    raise exception 'rollback left V3.6.4 private functions installed';
  end if;

  if exists (
    select 1 from pg_trigger
    where not tgisinternal
      and tgname like '%broadcast%data_revision%'
  ) then
    raise exception 'rollback left V3.6.4 triggers installed';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'realtime'
      and tablename = 'messages'
      and policyname = 'app_data_revision_receive_broadcast'
  ) then
    raise exception 'rollback left V3.6.4 Realtime policy installed';
  end if;

  if to_regclass('public.trips') is null
    or to_regclass('public.admin_users') is null
  then
    raise exception 'rollback removed a pre-existing application table';
  end if;
end;
$$;

select 'V3.6.4 rollback validation passed' as result;

