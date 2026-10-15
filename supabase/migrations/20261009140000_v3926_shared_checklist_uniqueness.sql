-- V3.9.26 shared checklist repair.
-- Keep one shared checklist per Trip, preserve the oldest row as canonical,
-- move non-conflicting items to it, and remove duplicate rows before adding
-- the invariant used by the client sync path.
alter table public.checklist_items
  add column if not exists category text null;

-- The attachment retry client persists these fields on shared expenses. Some
-- local databases were created before the complete V3.9.25 attachment schema;
-- add the nullable columns compatibly before exercising the UI flow.
alter table public.expenses
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_size bigint,
  add column if not exists attachment_status text not null default 'none',
  add column if not exists attachment_uploaded_at timestamptz,
  add column if not exists attachment_uploaded_by text,
  add column if not exists attachment_last_error text;

do $$
declare
  duplicate_row record;
  canonical_id uuid;
begin
  for duplicate_row in
    select trip_id
    from public.checklists
    where scope = 'shared'
    group by trip_id
    having count(*) > 1
  loop
    select c.id
      into canonical_id
    from public.checklists c
    where c.trip_id = duplicate_row.trip_id
      and c.scope = 'shared'
    order by c.created_at asc, c.id asc
    limit 1;

    -- Move only items whose client identity is not already present on the
    -- canonical checklist. Conflicting rows are retained on the canonical
    -- checklist by the first-created item.
    update public.checklist_items item
    set checklist_id = canonical_id
    where item.checklist_id in (
      select c.id
      from public.checklists c
      where c.trip_id = duplicate_row.trip_id
        and c.scope = 'shared'
        and c.id <> canonical_id
    )
    and not exists (
      select 1
      from public.checklist_items existing
      where existing.checklist_id = canonical_id
        and existing.client_item_id is not distinct from item.client_item_id
    );

    delete from public.checklists c
    where c.trip_id = duplicate_row.trip_id
      and c.scope = 'shared'
      and c.id <> canonical_id;
  end loop;
end;
$$;

create unique index if not exists checklists_one_shared_per_trip
on public.checklists (trip_id)
where scope = 'shared';
