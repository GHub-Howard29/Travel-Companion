-- Travel Companion V3-1 Other Info Cloud Validation
-- Updated: 2026-07-11
--
-- Run this in Supabase SQL Editor after:
-- docs/sql/005_other_info_cloud_schema.sql
-- and docs/sql/013_v350_other_info_security_scheme.sql

-- 1. Table
select
  table_schema,
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'other_info_items';

-- 2. Columns
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'other_info_items'
order by ordinal_position;

-- 3. Helper functions
select
  routine_schema,
  routine_name,
  routine_type,
  data_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'tc_other_info_role',
    'tc_can_edit_other_info',
    'tc_prevent_other_info_identity_update'
  )
order by routine_name;

-- 4. RLS enabled
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename = 'other_info_items';

-- 5. Policies
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'other_info_items'
order by policyname;

-- 6. Indexes
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'other_info_items'
  and indexname in (
    'other_info_items_pkey',
    'other_info_items_trip_folder_order_idx',
    'other_info_items_trip_deleted_idx',
    'other_info_items_created_by_idx',
    'other_info_items_one_client_item_per_trip'
  )
order by indexname;

-- 7. Triggers
select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table = 'other_info_items'
order by trigger_name;

-- 8. Grants
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'other_info_items'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;

-- 9. Function grants
select
  routine_schema,
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where routine_schema = 'public'
  and routine_name in (
    'tc_other_info_role',
    'tc_can_edit_other_info'
  )
  and grantee in ('anon', 'authenticated')
order by routine_name, grantee;

-- 10. V3.5.0 role values must be NULL or the manager-only pair.
select
  count(*) filter (where allowed_roles is null) as general_count,
  count(*) filter (
    where allowed_roles = array['trip_editor', 'super_admin']::text[]
  ) as sensitive_count,
  count(*) filter (
    where allowed_roles is not null
      and allowed_roles <> array['trip_editor', 'super_admin']::text[]
  ) as invalid_count
from public.other_info_items;
