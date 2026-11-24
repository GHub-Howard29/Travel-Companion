begin;

-- Retain the authoritative revision publisher and deletion tombstone, but remove
-- all journal-summary side effects from the publisher.
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
  set revision = revision + 1,
      updated_at = clock_timestamp(),
      source_client_id = private.tc_request_source_client_id()
  where singleton
  returning * into strict next_revision;

  if tg_table_schema = 'public' and tg_table_name = 'trips' and tg_op = 'DELETE' then
    insert into public.trip_deletion_tombstones (trip_id, deleted_at, deletion_revision)
    values (old.id, next_revision.updated_at, next_revision.revision);
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
    join public.admin_users as manager on manager.email = lower(app_user.email)
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

-- The checklist/expense summary triggers were already removed by RC2.
-- Remove remaining preview-journal table and its private writers/helpers.
drop table if exists public.trip_change_journal;
drop function if exists private.tc_record_trip_master_summary(jsonb, jsonb, bigint);
drop function if exists private.tc_itinerary_items(jsonb);
drop function if exists private.tc_json_array_added_count(jsonb, jsonb);
drop function if exists private.tc_json_array_deleted_count(jsonb, jsonb);
drop function if exists private.tc_json_array_updated_count(jsonb, jsonb);
drop function if exists private.tc_record_trip_change(text, bigint, text, text, integer);

commit;
