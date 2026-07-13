-- Travel Companion V3.2.0 Expense Date validation
--
-- Run this after docs/sql/007_expense_date_schema.sql.

select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'expenses'
      and column_name = 'expense_date'
      and data_type = 'date'
  ) as has_expense_date_column,
  exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'expenses'
      and indexname = 'expenses_trip_expense_date_idx'
  ) as has_expense_date_index,
  not exists (
    select 1
    from public.expenses
    where expense_date is null
  ) as all_expenses_have_expense_date;
