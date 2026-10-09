-- V3.9.26: local implementation candidate; NOT APPLIED to production.
-- Existing trips retain public visibility; new trips default private.
-- Do not deploy until guest/editor/storage/offline regression completes.
begin;

create table if not exists private.trip_participant_email_maps (
  trip_id text primary key,
  email_map jsonb not null default '{}'::jsonb
    check (jsonb_typeof(email_map) = 'object'),
  updated_at timestamptz not null default now()
);
alter table private.trip_participant_email_maps enable row level security;
revoke all on private.trip_participant_email_maps from public, anon, authenticated, service_role;

-- Snapshot the legacy participant email mappings before removing the public JSON key.
insert into private.trip_participant_email_maps (trip_id, email_map)
select id, content -> 'participantEmailMap'
from public.trips
where jsonb_typeof(content -> 'participantEmailMap') = 'object'
on conflict (trip_id) do update
set email_map = excluded.email_map, updated_at = now();

-- Preserve legacy embedded Other Info before removing its potentially role-restricted
-- text from public Trip JSON. The normalized table is authoritative.
insert into public.other_info_items
  (trip_id, client_item_id, folder_id, title, content, sort_order, created_at, updated_at)
select
  t.id,
  item ->> 'id',
  coalesce(item ->> 'folderId', ''),
  coalesce(item ->> 'title', ''),
  coalesce(item ->> 'content', ''),
  case when item ->> 'order' ~ '^-?[0-9]{1,8}$'
    then (item ->> 'order')::integer else 0 end,
  case when item ->> 'createdAt' ~ '^[0-9]{4}-'
    then (item ->> 'createdAt')::timestamptz else now() end,
  case when item ->> 'updatedAt' ~ '^[0-9]{4}-'
    then (item ->> 'updatedAt')::timestamptz else now() end
from public.trips t
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(t.content -> 'otherInfoItems') = 'array'
    then t.content -> 'otherInfoItems' else '[]'::jsonb end
) item
where nullif(item ->> 'id', '') is not null
  and not exists (
    select 1 from public.other_info_items existing
    where existing.trip_id = t.id
      and existing.client_item_id = item ->> 'id'
  )
on conflict do nothing;

-- Fail closed rather than silently discard any legacy cards without an ID.
do $$
begin
  if exists (
    select 1 from public.trips t
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(t.content -> 'otherInfoItems') = 'array'
        then t.content -> 'otherInfoItems' else '[]'::jsonb end
    ) item
    where not exists (
      select 1 from public.other_info_items i
      where i.trip_id = t.id and i.client_item_id = item ->> 'id'
    )
  ) then
    raise exception 'Legacy Other Info backfill incomplete; migration rolled back';
  end if;
end;
$$;

alter table public.trips
  add column if not exists is_public boolean not null default false;
-- Existing trips were historically public. Preserve that contract on migration.
update public.trips set is_public = true;
-- Stop exposing email addresses through the anonymous trips SELECT endpoint.
update public.trips
set content = content - 'participantEmailMap'
where content ? 'participantEmailMap';
update public.trips
set content = content - 'otherInfoItems'
where content ? 'otherInfoItems';

create or replace function private.tc_guard_trip_visibility_and_email_map()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  is_admin boolean;
  incoming_map jsonb;
begin
  is_admin := coalesce(public.tc_is_super_admin(), false);
  if tg_op = 'INSERT' then
    if new.is_public and not is_admin then
      raise insufficient_privilege using message = 'Only super_admin may publish a Trip';
    end if;
  elsif new.is_public is distinct from old.is_public and not is_admin then
    raise insufficient_privilege using message = 'Only super_admin may change Trip visibility';
  end if;

  if new.content ? 'participantEmailMap' then
    incoming_map := new.content -> 'participantEmailMap';
    if jsonb_typeof(incoming_map) <> 'object' then
      raise invalid_parameter_value using message = 'Invalid participant email mapping';
    end if;
    if is_admin then
      insert into private.trip_participant_email_maps (trip_id, email_map)
      values (new.id, incoming_map)
      on conflict (trip_id) do update
      set email_map = excluded.email_map, updated_at = now();
    end if;
    -- Editors may write the Trip but cannot change admin-owned email mapping.
    new.content := new.content - 'participantEmailMap';
  end if;
  -- Role-filtered Other Info must only be served by public.other_info_items RLS.
  new.content := new.content - 'otherInfoItems';
  return new;
end;
$$;
revoke all on function private.tc_guard_trip_visibility_and_email_map()
from public, anon, authenticated, service_role;

drop trigger if exists trips_guard_visibility_and_email_map on public.trips;
create trigger trips_guard_visibility_and_email_map
before insert or update on public.trips
for each row execute function private.tc_guard_trip_visibility_and_email_map();

create or replace function public.tc_read_trip_participant_email_map(target_trip_id text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  mapping jsonb;
begin
  if (select auth.uid()) is null or not
     (public.tc_is_super_admin() or public.tc_is_trip_editor(target_trip_id)) then
    return null;
  end if;
  select email_map into mapping
  from private.trip_participant_email_maps where trip_id = target_trip_id;
  return coalesce(mapping, '{}'::jsonb);
end;
$$;
revoke all on function public.tc_read_trip_participant_email_map(text)
from public, anon, authenticated, service_role;
grant execute on function public.tc_read_trip_participant_email_map(text) to authenticated;

drop policy if exists trips_select_policy on public.trips;
create policy trips_select_policy on public.trips
for select to anon, authenticated
using (is_public or (select public.tc_is_super_admin()) or
  (select public.tc_is_trip_editor(id)));

-- Read grants remain unchanged; RLS narrows access by Trip visibility.
drop policy if exists checklists_select_policy on public.checklists;
create policy checklists_select_policy on public.checklists
for select to anon, authenticated
using (
  (scope = 'shared' and exists (select 1 from public.trips t where t.id = checklists.trip_id))
  or (
    scope = 'private' and (select auth.uid()) is not null
    and owner_user_id = (select auth.uid())
    and (select public.tc_can_sync_private_checklist(checklists.trip_id))
  )
);

drop policy if exists checklist_items_select_policy on public.checklist_items;
create policy checklist_items_select_policy on public.checklist_items
for select to anon, authenticated
using (
  exists (
    select 1 from public.checklists c
    where c.id = checklist_items.checklist_id
      and (
        (c.scope = 'shared' and exists (select 1 from public.trips t where t.id = c.trip_id))
        or (
          c.scope = 'private'
          and (select auth.uid()) is not null
          and c.owner_user_id = (select auth.uid())
          and (select public.tc_can_sync_private_checklist(c.trip_id))
        )
      )
  )
);

drop policy if exists other_info_items_select_policy on public.other_info_items;
create policy other_info_items_select_policy on public.other_info_items
for select to anon, authenticated
using (
  exists (select 1 from public.trips t where t.id = other_info_items.trip_id)
  and (
    deleted_at is null or
    (select public.tc_can_edit_other_info(other_info_items.trip_id))
  )
  and (
    allowed_roles is null
    or cardinality(allowed_roles) = 0
    or allowed_roles @> array[(select public.tc_other_info_role(other_info_items.trip_id))]
  )
);

-- Anonymous viewers of public Trips require this immutable path encoder for
-- Storage RLS; the helper reveals no private data on its own.
grant execute on function public.tc_attachment_storage_scope(text) to anon;

-- The previous public cover URLs must stop bypassing private Trip visibility.
-- The frontend will use short-lived signed URLs, and cache image bytes for offline use.
update storage.buckets set public = false where id = 'itinerary-covers';

drop policy if exists itinerary_covers_select_v390 on storage.objects;
create policy itinerary_covers_select_v3926 on storage.objects
for select to anon, authenticated
using (
  bucket_id = 'itinerary-covers'
  and array_length(storage.foldername(name), 1) = 2
  and exists (
    select 1 from public.trips as trip
    where public.tc_attachment_storage_scope(trip.id) = (storage.foldername(name))[1]
      and (
        trip.is_public
        or (select public.tc_is_super_admin())
        or (select public.tc_is_trip_editor(trip.id))
      )
  )
);

-- Prevent private maps being orphaned when the underlying Trip is deleted.
create or replace function private.tc_purge_trip_participant_emails()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  delete from private.trip_participant_email_maps where trip_id = old.id;
  return old;
end;
$$;
revoke all on function private.tc_purge_trip_participant_emails()
from public, anon, authenticated, service_role;
drop trigger if exists trips_purge_participant_emails on public.trips;
create trigger trips_purge_participant_emails
after delete on public.trips for each row
execute function private.tc_purge_trip_participant_emails();

commit;
