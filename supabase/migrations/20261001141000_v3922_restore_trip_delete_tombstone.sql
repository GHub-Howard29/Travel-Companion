-- Travel Companion V3.9.22 RC3 hotfix:
-- restore permanent Trip deletion tombstones after V3.9.17 Change Journal
-- replaced tc_broadcast_trip_data_revision() without the V3.8.1 DELETE branch.
--
-- Keep the current Change Journal + Broadcast behavior intact and restore only
-- the authoritative tombstone write required by public.tc_delete_trip().

begin;

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
  affected_trip_id text;
begin
  update public.app_data_revision
  set
    revision = revision + 1,
    updated_at = clock_timestamp(),
    source_client_id = private.tc_request_source_client_id()
  where singleton
  returning * into strict next_revision;

  if tg_table_schema = 'public' and tg_table_name = 'trips' then
    affected_trip_id := case
      when tg_op = 'DELETE' then to_jsonb(old) ->> 'id'
      else to_jsonb(new) ->> 'id'
    end;

    if tg_op = 'DELETE' then
      insert into public.trip_deletion_tombstones (
        trip_id,
        deleted_at,
        deletion_revision
      ) values (
        affected_trip_id,
        next_revision.updated_at,
        next_revision.revision
      );
    end if;

    if tg_op = 'UPDATE' then
      perform private.tc_record_trip_master_summary(
        to_jsonb(old),
        to_jsonb(new),
        next_revision.revision
      );
    else
      perform private.tc_record_trip_change(
        affected_trip_id,
        next_revision.revision,
        'settings',
        case when tg_op = 'INSERT' then 'added' else 'deleted' end,
        1
      );
    end if;
  end if;

  if tg_table_schema = 'public'
    and tg_table_name = 'admin_users'
    and tg_op in ('UPDATE', 'DELETE')
  then
    if (to_jsonb(old) ->> 'role') = 'trip_editor' then
      removed_editor_email := lower(to_jsonb(old) ->> 'email');
    end if;
  end if;

  if tg_table_schema = 'public' and tg_table_name = 'admin_users' then
    affected_trip_id := case
      when tg_op = 'DELETE' then to_jsonb(old) ->> 'trip_id'
      else coalesce(to_jsonb(new) ->> 'trip_id', to_jsonb(old) ->> 'trip_id')
    end;
    if affected_trip_id is not null then
      perform private.tc_record_trip_change(
        affected_trip_id,
        next_revision.revision,
        'settings',
        'changed',
        1
      );
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

commit;
