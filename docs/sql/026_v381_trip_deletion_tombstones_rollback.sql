-- V3.8.1 test-environment rollback.
-- Permanent tombstones are deletion history: this script refuses to erase any.
-- Production must use a forward migration instead of this rollback.

begin;

do $$
begin
  if exists (select 1 from public.trip_deletion_tombstones) then
    raise exception 'Rollback refused: permanent Trip tombstones exist';
  end if;
end;
$$;

drop function if exists public.tc_delete_trip(text);

drop trigger if exists trips_reject_tombstoned_id_insert on public.trips;
drop trigger if exists trips_reject_protected_seed_delete on public.trips;
drop function if exists private.tc_reject_tombstoned_trip_insert();
drop function if exists private.tc_reject_protected_trip_delete();
drop function if exists private.tc_is_protected_seed_trip_id(text);

drop policy if exists trips_delete_policy on public.trips;
grant delete on table public.trips to authenticated;
create policy trips_delete_policy
on public.trips
for delete
to authenticated
using ((select public.tc_is_super_admin()));

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

drop table public.trip_deletion_tombstones;

commit;
