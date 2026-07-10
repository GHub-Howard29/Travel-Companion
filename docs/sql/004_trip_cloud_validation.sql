-- Travel Companion V3-1 Trip Cloud Validation
-- Updated: 2026-07-10
--
-- Run this in Supabase SQL Editor after:
-- docs/sql/003_trip_cloud_schema.sql

-- 1. Table
select
  table_schema,
  table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'trips';

-- 2. Columns
select
  column_name,
  data_type,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'trips'
order by ordinal_position;

-- 3. RLS enabled
select
  schemaname,
  tablename,
  rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('trips', 'admin_users')
order by tablename;

-- 4. Policies
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
  and (
    tablename = 'trips'
    or (
      tablename = 'admin_users'
      and policyname in (
        'admin_users_select_policy',
        'admin_users_insert_policy',
        'admin_users_update_policy',
        'admin_users_delete_policy'
      )
    )
  )
order by tablename, policyname;

-- 5. Indexes
select
  schemaname,
  tablename,
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('trips', 'admin_users')
  and indexname in (
    'trips_pkey',
    'trips_departure_date_idx',
    'trips_created_by_idx',
    'admin_users_one_role_per_trip_email'
  )
order by tablename, indexname;

-- 6. Trigger
select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table = 'trips'
order by trigger_name;

-- 7. Grants
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('trips', 'admin_users')
  and grantee in ('anon', 'authenticated')
  and (
    table_name = 'trips'
    or grantee = 'authenticated'
  )
order by grantee, privilege_type;
