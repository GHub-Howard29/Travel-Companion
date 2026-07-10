-- Travel Companion V3-1 Trip Cloud Schema
-- Updated: 2026-07-10
--
-- Purpose:
-- - Add Supabase storage for Trip metadata and detail content.
-- - Keep Guest browsing available.
-- - Reuse admin_users(email, role, trip_id) for write permissions.
--
-- Assumptions:
-- - public.admin_users already exists with: email, role, trip_id.
-- - docs/sql/001_checklist_cloud_schema.sql has already created helper
--   functions such as tc_is_super_admin, tc_is_trip_editor, and
--   tc_touch_updated_at.

create extension if not exists pgcrypto;

create table if not exists public.trips (
  id text primary key,
  title text not null,
  departure_date date not null,
  participants jsonb not null default '[]'::jsonb,
  currency_config jsonb not null default '{"code":"JPY","symbol":"￥"}'::jsonb,
  sidebar_config jsonb not null default '[]'::jsonb,
  content jsonb not null default '{}'::jsonb,
  created_by uuid null default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trips_participants_array_check check (jsonb_typeof(participants) = 'array'),
  constraint trips_currency_config_object_check check (jsonb_typeof(currency_config) = 'object'),
  constraint trips_sidebar_config_array_check check (jsonb_typeof(sidebar_config) = 'array'),
  constraint trips_content_object_check check (jsonb_typeof(content) = 'object')
);

create index if not exists trips_departure_date_idx
on public.trips (departure_date desc);

create index if not exists trips_created_by_idx
on public.trips (created_by);

drop trigger if exists trips_touch_updated_at on public.trips;
create trigger trips_touch_updated_at
before update on public.trips
for each row
execute function public.tc_touch_updated_at();

alter table public.trips enable row level security;

drop policy if exists trips_select_policy on public.trips;
create policy trips_select_policy
on public.trips
for select
using (true);

drop policy if exists trips_insert_policy on public.trips;
create policy trips_insert_policy
on public.trips
for insert
with check (
  (select auth.uid()) is not null
  and (
    (select public.tc_is_super_admin())
    or (select public.tc_is_trip_editor(id))
  )
);

drop policy if exists trips_update_policy on public.trips;
create policy trips_update_policy
on public.trips
for update
using (
  (select public.tc_is_super_admin())
  or (select public.tc_is_trip_editor(id))
)
with check (
  (select public.tc_is_super_admin())
  or (select public.tc_is_trip_editor(id))
);

drop policy if exists trips_delete_policy on public.trips;
create policy trips_delete_policy
on public.trips
for delete
using ((select public.tc_is_super_admin()));

create unique index if not exists admin_users_one_role_per_trip_email
on public.admin_users (email, role, trip_id);

alter table public.admin_users enable row level security;

drop policy if exists "Allow read for everyon" on public.admin_users;

drop policy if exists admin_users_select_policy on public.admin_users;
create policy admin_users_select_policy
on public.admin_users
for select
using (
  email = public.tc_current_email()
  or public.tc_is_super_admin()
  or public.tc_is_trip_editor(trip_id)
);

drop policy if exists admin_users_insert_policy on public.admin_users;
create policy admin_users_insert_policy
on public.admin_users
for insert
with check (public.tc_is_super_admin());

drop policy if exists admin_users_update_policy on public.admin_users;
create policy admin_users_update_policy
on public.admin_users
for update
using (public.tc_is_super_admin())
with check (public.tc_is_super_admin());

drop policy if exists admin_users_delete_policy on public.admin_users;
create policy admin_users_delete_policy
on public.admin_users
for delete
using (public.tc_is_super_admin());

revoke all on public.trips from anon;
revoke all on public.trips from authenticated;
revoke all on public.admin_users from anon;
revoke all on public.admin_users from authenticated;

grant select on public.trips to anon, authenticated;
grant insert, update, delete on public.trips to authenticated;
grant select on public.admin_users to authenticated;
grant insert, update, delete on public.admin_users to authenticated;
