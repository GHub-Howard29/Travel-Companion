-- V3.8.1 production dependency preflight.
--
-- Read-only: this script only reports missing pre-V3.8.1 dependencies and
-- unexpected V3.8.1 objects. It does not create, alter, or delete anything.

with
required_relations (object_name) as (
  values
    ('public.trips'),
    ('public.admin_users'),
    ('public.app_data_revision'),
    ('public.checklists'),
    ('public.other_info_items'),
    ('public.exchange_purchases'),
    ('public.expenses')
),
required_columns (table_schema, table_name, column_name) as (
  values
    ('public', 'trips', 'id'),
    ('public', 'admin_users', 'email'),
    ('public', 'admin_users', 'role'),
    ('public', 'admin_users', 'trip_id'),
    ('public', 'app_data_revision', 'singleton'),
    ('public', 'app_data_revision', 'revision'),
    ('public', 'app_data_revision', 'updated_at'),
    ('public', 'app_data_revision', 'source_client_id'),
    ('public', 'checklists', 'trip_id'),
    ('public', 'checklists', 'scope'),
    ('public', 'other_info_items', 'trip_id'),
    ('public', 'exchange_purchases', 'trip_id'),
    ('public', 'expenses', 'trip_id')
),
required_functions (object_name) as (
  values
    ('private.tc_request_source_client_id()'),
    ('private.tc_is_super_admin()'),
    ('private.tc_broadcast_trip_data_revision()'),
    ('realtime.send(jsonb,text,text,boolean)')
),
required_triggers (table_schema, table_name, trigger_name) as (
  values
    ('public', 'trips', 'trips_broadcast_data_revision_delete')
),
missing_dependencies as (
  select 'relation'::text as object_type, relation.object_name
  from required_relations as relation
  where to_regclass(relation.object_name) is null

  union all

  select
    'column',
    column_requirement.table_schema || '.' ||
      column_requirement.table_name || '.' ||
      column_requirement.column_name
  from required_columns as column_requirement
  where not exists (
    select 1
    from information_schema.columns as existing_column
    where existing_column.table_schema = column_requirement.table_schema
      and existing_column.table_name = column_requirement.table_name
      and existing_column.column_name = column_requirement.column_name
  )

  union all

  select 'function', function_requirement.object_name
  from required_functions as function_requirement
  where to_regprocedure(function_requirement.object_name) is null

  union all

  select
    'trigger',
    trigger_requirement.table_schema || '.' ||
      trigger_requirement.table_name || '.' ||
      trigger_requirement.trigger_name
  from required_triggers as trigger_requirement
  where not exists (
    select 1
    from pg_trigger as existing_trigger
    join pg_class as trigger_table
      on trigger_table.oid = existing_trigger.tgrelid
    join pg_namespace as trigger_schema
      on trigger_schema.oid = trigger_table.relnamespace
    where trigger_schema.nspname = trigger_requirement.table_schema
      and trigger_table.relname = trigger_requirement.table_name
      and existing_trigger.tgname = trigger_requirement.trigger_name
      and not existing_trigger.tgisinternal
  )
),
unexpected_v381_objects as (
  select 'relation'::text as object_type,
    'public.trip_deletion_tombstones'::text as object_name
  where to_regclass('public.trip_deletion_tombstones') is not null

  union all

  select 'function', 'public.tc_delete_trip(text)'
  where to_regprocedure('public.tc_delete_trip(text)') is not null

  union all

  select 'function', 'private.tc_is_protected_seed_trip_id(text)'
  where to_regprocedure('private.tc_is_protected_seed_trip_id(text)') is not null

  union all

  select 'function', 'private.tc_reject_protected_trip_delete()'
  where to_regprocedure('private.tc_reject_protected_trip_delete()') is not null

  union all

  select 'function', 'private.tc_reject_tombstoned_trip_insert()'
  where to_regprocedure('private.tc_reject_tombstoned_trip_insert()') is not null

  union all

  select 'trigger', 'public.trips.trips_reject_protected_seed_delete'
  where exists (
    select 1
    from pg_trigger
    where tgname = 'trips_reject_protected_seed_delete'
      and not tgisinternal
  )

  union all

  select 'trigger', 'public.trips.trips_reject_tombstoned_id_insert'
  where exists (
    select 1
    from pg_trigger
    where tgname = 'trips_reject_tombstoned_id_insert'
      and not tgisinternal
  )
)
select
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'type', missing.object_type,
          'name', missing.object_name
        )
        order by missing.object_type, missing.object_name
      )
      from missing_dependencies as missing
    ),
    '[]'::jsonb
  ) as missing_dependencies,
  coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'type', unexpected.object_type,
          'name', unexpected.object_name
        )
        order by unexpected.object_type, unexpected.object_name
      )
      from unexpected_v381_objects as unexpected
    ),
    '[]'::jsonb
  ) as unexpected_v381_objects;
