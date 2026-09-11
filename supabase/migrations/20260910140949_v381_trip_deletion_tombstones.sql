-- Travel Companion V3.8.1 permanent Trip deletion tombstones.
--
-- Storage objects are removed by the client before tc_delete_trip is called.
-- Database cleanup, Trip deletion, tombstone creation, revision increment and
-- Broadcast are committed or rolled back as one database transaction.

begin;

create table public.trip_deletion_tombstones (
  trip_id text primary key,
  deleted_at timestamptz not null default now(),
  deletion_revision bigint not null,
  constraint trip_deletion_tombstones_revision_nonnegative_check
    check (deletion_revision >= 0)
);

alter table public.trip_deletion_tombstones enable row level security;

revoke all on table public.trip_deletion_tombstones
  from public, anon, authenticated;
grant select on table public.trip_deletion_tombstones to anon, authenticated;

create policy trip_deletion_tombstones_select_policy
on public.trip_deletion_tombstones
for select
to anon, authenticated
using (true);

create or replace function private.tc_is_protected_seed_trip_id(target_trip_id text)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $$
  select target_trip_id in (
    'free-travel-2026-01',
    'group-tour-2026-10'
  );
$$;

revoke all on function private.tc_is_protected_seed_trip_id(text)
  from public, anon, authenticated, service_role;

create or replace function private.tc_reject_protected_trip_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.tc_is_protected_seed_trip_id(old.id) then
    raise exception using
      errcode = 'P0001',
      message = 'Protected seed Trip cannot be deleted',
      detail = old.id;
  end if;

  return old;
end;
$$;

revoke all on function private.tc_reject_protected_trip_delete()
  from public, anon, authenticated, service_role;

drop trigger if exists trips_reject_protected_seed_delete on public.trips;
create trigger trips_reject_protected_seed_delete
before delete on public.trips
for each row
execute function private.tc_reject_protected_trip_delete();

create or replace function private.tc_reject_tombstoned_trip_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.trip_deletion_tombstones as tombstone
    where tombstone.trip_id = new.id
  ) then
    raise unique_violation using
      message = 'Trip ID was permanently deleted',
      detail = new.id,
      constraint = 'trips_tombstoned_id_key';
  end if;

  return new;
end;
$$;

revoke all on function private.tc_reject_tombstoned_trip_insert()
  from public, anon, authenticated, service_role;

drop trigger if exists trips_reject_tombstoned_id_insert on public.trips;
create trigger trips_reject_tombstoned_id_insert
before insert on public.trips
for each row
execute function private.tc_reject_tombstoned_trip_insert();

drop policy if exists trips_delete_policy on public.trips;
revoke delete on table public.trips from authenticated;

-- Browser clients must use tc_delete_trip so dependent-row cleanup, the Trip
-- DELETE, tombstone creation and revision Broadcast share one transaction.
-- The protected-seed trigger still rejects privileged/service-role bypasses.

-- Replace the V3.6.4 trigger function so a Trip DELETE owns exactly one
-- authoritative deletion revision and writes its tombstone before Broadcast.
create or replace function private.tc_broadcast_trip_data_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_revision public.app_data_revision%rowtype;
  recipient record;
  removed_editor_email text;
begin
  update public.app_data_revision
  set
    revision = revision + 1,
    updated_at = clock_timestamp(),
    source_client_id = private.tc_request_source_client_id()
  where singleton
  returning * into strict next_revision;

  if tg_table_schema = 'public'
    and tg_table_name = 'trips'
    and tg_op = 'DELETE'
  then
    insert into public.trip_deletion_tombstones (
      trip_id,
      deleted_at,
      deletion_revision
    ) values (
      old.id,
      next_revision.updated_at,
      next_revision.revision
    );
  end if;

  if tg_table_schema = 'public'
    and tg_table_name = 'admin_users'
    and tg_op in ('UPDATE', 'DELETE')
  then
    if (to_jsonb(old) ->> 'role') = 'trip_editor' then
      removed_editor_email := lower(to_jsonb(old) ->> 'email');
    end if;
  end if;

  for recipient in
    select distinct app_user.id
    from auth.users as app_user
    join public.admin_users as manager
      on manager.email = lower(app_user.email)
    where manager.role in ('super_admin', 'trip_editor')

    union

    select removed_user.id
    from auth.users as removed_user
    where removed_editor_email is not null
      and lower(removed_user.email) = removed_editor_email
  loop
    perform realtime.send(
      jsonb_build_object(
        'revision', next_revision.revision,
        'updated_at', next_revision.updated_at,
        'source_client_id', next_revision.source_client_id
      ),
      'revision_changed',
      'travel-companion:data-revision:' || recipient.id::text,
      true
    );
  end loop;

  return null;
end;
$$;

revoke all on function private.tc_broadcast_trip_data_revision()
  from public, anon, authenticated, service_role;

create or replace function public.tc_delete_trip(target_trip_id text)
returns table (
  deleted_trip_id text,
  deletion_revision bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_trip_id text;
begin
  if (select auth.uid()) is null or not private.tc_is_super_admin() then
    raise insufficient_privilege using
      message = 'Only super_admin can delete a Trip';
  end if;

  if target_trip_id is null or btrim(target_trip_id) = '' then
    raise invalid_parameter_value using message = 'Trip ID is required';
  end if;

  if private.tc_is_protected_seed_trip_id(target_trip_id) then
    raise exception using
      errcode = 'P0001',
      message = 'Protected seed Trip cannot be deleted',
      detail = target_trip_id;
  end if;

  -- Lock the Trip before touching dependent rows. Every caller follows the
  -- same lock order, keeping this transaction short and deterministic.
  perform 1
  from public.trips as trip
  where trip.id = target_trip_id
  for update;

  if not found then
    raise no_data_found using message = 'Trip does not exist';
  end if;

  -- Private checklist rows intentionally remain under the existing retention
  -- policy. Personal expense books use their own scoped Trip IDs.
  delete from public.checklists
  where trip_id = target_trip_id and scope = 'shared';

  delete from public.other_info_items where trip_id = target_trip_id;
  delete from public.exchange_purchases where trip_id = target_trip_id;
  delete from public.expenses where trip_id = target_trip_id;
  delete from public.admin_users
  where role = 'trip_editor' and trip_id = target_trip_id;

  delete from public.trips
  where id = target_trip_id
  returning id into removed_trip_id;

  if removed_trip_id is null then
    raise no_data_found using message = 'Trip deletion affected zero rows';
  end if;

  return query
  select tombstone.trip_id, tombstone.deletion_revision
  from public.trip_deletion_tombstones as tombstone
  where tombstone.trip_id = removed_trip_id;

  if not found then
    raise data_exception using message = 'Trip tombstone was not created';
  end if;
end;
$$;

revoke all on function public.tc_delete_trip(text)
  from public, anon, authenticated, service_role;
grant execute on function public.tc_delete_trip(text) to authenticated;

commit;
