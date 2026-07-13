-- Travel Companion V3.2.0 Expense Date schema update
--
-- Purpose:
-- - Add an explicit accounting date to shared expense rows.
-- - Keep existing rows compatible by backfilling from created_at.

alter table if exists public.expenses
  add column if not exists expense_date date;

update public.expenses
set expense_date = coalesce(expense_date, created_at::date, current_date)
where expense_date is null;

alter table if exists public.expenses
  alter column expense_date set default current_date;

create index if not exists expenses_trip_expense_date_idx
  on public.expenses (trip_id, expense_date desc, created_at desc);
