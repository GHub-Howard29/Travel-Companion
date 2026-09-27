-- Travel Companion V3.9.15 expense realtime publication.
-- ExpenseScreen already subscribes to Postgres Changes; this migration makes
-- the expenses table part of the Supabase Realtime publication so cross-device
-- add/edit/delete invalidations can arrive without waiting for the 30s fallback.

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table public.expenses;
  end if;
end;
$$;
