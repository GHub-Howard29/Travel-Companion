-- Travel Companion V3-1 Other Info Cloud Schema
-- Updated: 2026-07-11
--
-- Purpose:
-- - Add Supabase storage for Other Info / Reference items.
-- - Keep Guest browsing available.
-- - Reuse admin_users(email, role, trip_id) for write permissions.
-- - Support role-filtered reading through allowed_roles.
--
-- Assumptions:
-- - public.admin_users already exists with: email, role, trip_id.
-- - docs/sql/001_checklist_cloud_schema.sql has already created helper
--   functions such as tc_current_email, tc_is_super_admin,
--   tc_is_trip_editor, and tc_touch_updated_at.

create extension if not exists pgcrypto;

create or replace function public.tc_other_info_role(target_trip_id text)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when public.tc_is_super_admin() then 'super_admin'
    when public.tc_is_trip_editor(target_trip_id) then 'trip_editor'
    when (select auth.uid()) is not null then 'user'
    else 'guest'
  end;
$$;

create or replace function public.tc_can_edit_other_info(target_trip_id text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.tc_is_super_admin()
    or public.tc_is_trip_editor(target_trip_id);
$$;

create table if not exists public.other_info_items (
  id uuid primary key default gen_random_uuid(),
  trip_id text not null,
  client_item_id text null,
  folder_id text not null,
  title text not null,
  content text not null,
  allowed_roles text[] null,
  sort_order integer not null default 0,
  created_by uuid null default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,
  constraint other_info_items_allowed_roles_check check (
    allowed_roles is null
    or allowed_roles = array['trip_editor', 'super_admin']::text[]
  )
);

create index if not exists other_info_items_trip_folder_order_idx
on public.other_info_items (trip_id, folder_id, sort_order, created_at)
where deleted_at is null;

create index if not exists other_info_items_trip_deleted_idx
on public.other_info_items (trip_id, deleted_at);

create index if not exists other_info_items_created_by_idx
on public.other_info_items (created_by);

create unique index if not exists other_info_items_one_client_item_per_trip
on public.other_info_items (trip_id, client_item_id)
where client_item_id is not null;

create or replace function public.tc_prevent_other_info_identity_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.trip_id <> old.trip_id then
    raise exception 'Cannot change other info trip_id';
  end if;

  if new.client_item_id is distinct from old.client_item_id then
    raise exception 'Cannot change other info client_item_id';
  end if;

  return new;
end;
$$;

drop trigger if exists other_info_items_touch_updated_at on public.other_info_items;
create trigger other_info_items_touch_updated_at
before update on public.other_info_items
for each row
execute function public.tc_touch_updated_at();

drop trigger if exists other_info_items_prevent_identity_update on public.other_info_items;
create trigger other_info_items_prevent_identity_update
before update on public.other_info_items
for each row
execute function public.tc_prevent_other_info_identity_update();

alter table public.other_info_items enable row level security;

drop policy if exists other_info_items_select_policy on public.other_info_items;
create policy other_info_items_select_policy
on public.other_info_items
for select
using (
  deleted_at is null
  and (
    allowed_roles is null
    or cardinality(allowed_roles) = 0
    or allowed_roles @> array[public.tc_other_info_role(trip_id)]::text[]
  )
);

drop policy if exists other_info_items_insert_policy on public.other_info_items;
create policy other_info_items_insert_policy
on public.other_info_items
for insert
with check (
  (select auth.uid()) is not null
  and public.tc_can_edit_other_info(trip_id)
);

drop policy if exists other_info_items_update_policy on public.other_info_items;
create policy other_info_items_update_policy
on public.other_info_items
for update
using (
  (select auth.uid()) is not null
  and public.tc_can_edit_other_info(trip_id)
)
with check (
  (select auth.uid()) is not null
  and public.tc_can_edit_other_info(trip_id)
);

drop policy if exists other_info_items_delete_policy on public.other_info_items;
create policy other_info_items_delete_policy
on public.other_info_items
for delete
using (
  (select auth.uid()) is not null
  and public.tc_can_edit_other_info(trip_id)
);

revoke all on public.other_info_items from anon;
revoke all on public.other_info_items from authenticated;

grant execute on function public.tc_other_info_role(text) to anon, authenticated;
grant execute on function public.tc_can_edit_other_info(text) to anon, authenticated;

grant select on public.other_info_items to anon, authenticated;
grant insert, update, delete on public.other_info_items to authenticated;
