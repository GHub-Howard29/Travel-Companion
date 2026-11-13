-- V3.11.0 upgrade: preserve request-registry ownership evidence after Auth deletion.
--
-- This migration upgrades databases that already applied the original
-- 20261103150000_v3110_trip_excel_create_rpc.sql while user_id still referenced
-- auth.users(id) ON DELETE CASCADE. CREATE TABLE IF NOT EXISTS in the original
-- migration cannot alter an existing table, so this forward migration is
-- required on those databases.
--
-- Preserve all existing rows. Historical rows already cascade-deleted before
-- this migration cannot be reconstructed.
--
-- Apply only to the intended company-local V5 integration-test database during
-- this development phase. Do not reset the database. Do not apply to linked,
-- shared, or production databases without a separate release decision.

begin;

do $migration$
declare
  v_table regclass := to_regclass('private.tc_trip_excel_create_requests');
  v_constraint record;
begin
  if v_table is null then
    raise exception
      'V3.11.0 request registry is missing; apply 20261103150000_v3110_trip_excel_create_rpc.sql first';
  end if;

  if exists (
    select 1
      from private.tc_trip_excel_create_requests
     where user_id is null
  ) then
    raise exception
      'V3.11.0 request registry contains NULL owner IDs; refusing unsafe upgrade';
  end if;

  -- Remove only foreign keys from this registry to auth.users. The constraint
  -- name is discovered from PostgreSQL catalogs rather than assumed.
  for v_constraint in
    select con.conname
      from pg_constraint con
     where con.contype = 'f'
       and con.conrelid = v_table
       and con.confrelid = 'auth.users'::regclass
  loop
    execute format(
      'alter table private.tc_trip_excel_create_requests drop constraint %I',
      v_constraint.conname
    );
  end loop;

  alter table private.tc_trip_excel_create_requests
    alter column user_id set not null;
end;
$migration$;

create or replace function public.tc_get_trip_excel_create_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_existing private.tc_trip_excel_create_requests%rowtype;
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'TC_EXCEL_AUTH_REQUIRED';
  end if;
  if not coalesce(private.tc_is_super_admin(), false) then
    raise exception using errcode = '42501', message = 'TC_EXCEL_SUPER_ADMIN_REQUIRED';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'TC_EXCEL_REQUEST_ID_REQUIRED';
  end if;

  select *
    into v_existing
    from private.tc_trip_excel_create_requests
   where request_id = p_request_id
     and user_id = v_user_id;

  if not found then
    return jsonb_build_object('status', 'NOT_FOUND', 'request_id', p_request_id);
  end if;
  if v_existing.trip_id = 'pending' or v_existing.response_payload = '{}'::jsonb then
    return jsonb_build_object('status', 'PENDING', 'request_id', p_request_id);
  end if;
  if not exists (select 1 from public.trips where id = v_existing.trip_id) then
    return jsonb_build_object(
      'status', 'TRIP_DELETED',
      'request_id', p_request_id,
      'trip_id', v_existing.trip_id
    );
  end if;

  return v_existing.response_payload || jsonb_build_object(
    'status', 'CREATED',
    'request_id', p_request_id,
    'trip_id', v_existing.trip_id,
    'idempotent_replay', true
  );
end;
$$;

revoke all on function public.tc_get_trip_excel_create_request(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.tc_get_trip_excel_create_request(uuid)
  to authenticated;

commit;
