-- Travel Companion V3.5.1 cross-device refresh publication.
-- The frontend treats change payloads only as invalidation signals and always
-- performs an RLS-protected refetch before rendering data.

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'other_info_items',
    'checklists',
    'checklist_items'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = target_table
    ) then
      execute format(
        'alter publication supabase_realtime add table public.%I',
        target_table
      );
    end if;
  end loop;
end;
$$;
