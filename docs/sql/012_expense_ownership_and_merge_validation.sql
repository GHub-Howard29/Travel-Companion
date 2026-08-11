-- Run after 011_expense_ownership_and_merge_schema.sql.

select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'expenses'
  and column_name in (
    'client_item_id',
    'owner_user_id',
    'recorded_by_email',
    'updated_at',
    'deleted_at'
  )
order by column_name;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'expenses'
  and indexname in (
    'expenses_one_client_item_per_trip',
    'expenses_trip_owner_idx',
    'expenses_trip_active_created_idx'
  )
order by indexname;

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'expenses'
order by policyname;

select
  count(*) filter (where client_item_id is null) as missing_client_item_id,
  count(*) filter (where owner_user_id is null) as legacy_owner_rows,
  count(*) as total_rows
from public.expenses;
