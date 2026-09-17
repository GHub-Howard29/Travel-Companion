-- Restore RLS and the legacy role matrix for tables that predate the tracked
-- migration chain. The V3.9.1 clean-build baseline recreates these tables;
-- this forward-only migration restores their effective Data API boundary.

begin;

-- This helper originally lived in the unmanaged checklist schema. Keep the
-- public wrapper unprivileged; the hardened role checks remain in private.
create or replace function public.tc_can_sync_private_checklist(target_trip_id text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.tc_is_super_admin()
    or public.tc_is_trip_editor(target_trip_id);
$$;

revoke all on function public.tc_can_sync_private_checklist(text)
  from public, anon, authenticated;
grant execute on function public.tc_can_sync_private_checklist(text)
  to anon, authenticated;

alter table public.checklists enable row level security;
alter table public.checklist_items enable row level security;
alter table public.other_info_items enable row level security;
alter table public.exchange_purchases enable row level security;

drop policy if exists checklists_select_policy on public.checklists;
create policy checklists_select_policy
on public.checklists
for select
to anon, authenticated
using (
  scope = 'shared'
  or (
    scope = 'private'
    and (select auth.uid()) is not null
    and owner_user_id = (select auth.uid())
    and (select public.tc_can_sync_private_checklist(trip_id))
  )
);

drop policy if exists checklists_insert_policy on public.checklists;
create policy checklists_insert_policy
on public.checklists
for insert
to authenticated
with check (
  (
    scope = 'shared'
    and owner_user_id is null
    and (select public.tc_can_edit_shared_checklist(trip_id))
  )
  or (
    scope = 'private'
    and (select auth.uid()) is not null
    and owner_user_id = (select auth.uid())
    and created_by = (select auth.uid())
    and (select public.tc_can_sync_private_checklist(trip_id))
  )
);

drop policy if exists checklists_update_policy on public.checklists;
create policy checklists_update_policy
on public.checklists
for update
to authenticated
using (
  (
    scope = 'shared'
    and (select public.tc_can_edit_shared_checklist(trip_id))
  )
  or (
    scope = 'private'
    and (select auth.uid()) is not null
    and owner_user_id = (select auth.uid())
    and (select public.tc_can_sync_private_checklist(trip_id))
  )
)
with check (
  (
    scope = 'shared'
    and owner_user_id is null
    and (select public.tc_can_edit_shared_checklist(trip_id))
  )
  or (
    scope = 'private'
    and (select auth.uid()) is not null
    and owner_user_id = (select auth.uid())
    and (select public.tc_can_sync_private_checklist(trip_id))
  )
);

drop policy if exists checklists_delete_policy on public.checklists;
create policy checklists_delete_policy
on public.checklists
for delete
to authenticated
using (
  (
    scope = 'shared'
    and (select public.tc_can_edit_shared_checklist(trip_id))
  )
  or (
    scope = 'private'
    and (select auth.uid()) is not null
    and owner_user_id = (select auth.uid())
    and (select public.tc_can_sync_private_checklist(trip_id))
  )
);

drop policy if exists checklist_items_select_policy on public.checklist_items;
create policy checklist_items_select_policy
on public.checklist_items
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.checklists as checklist
    where checklist.id = checklist_items.checklist_id
      and (
        checklist.scope = 'shared'
        or (
          checklist.scope = 'private'
          and (select auth.uid()) is not null
          and checklist.owner_user_id = (select auth.uid())
          and (select public.tc_can_sync_private_checklist(checklist.trip_id))
        )
      )
  )
);

drop policy if exists checklist_items_insert_policy on public.checklist_items;
create policy checklist_items_insert_policy
on public.checklist_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.checklists as checklist
    where checklist.id = checklist_items.checklist_id
      and (
        (
          checklist.scope = 'shared'
          and (select public.tc_can_edit_shared_checklist(checklist.trip_id))
        )
        or (
          checklist.scope = 'private'
          and (select auth.uid()) is not null
          and checklist.owner_user_id = (select auth.uid())
          and created_by = (select auth.uid())
          and (select public.tc_can_sync_private_checklist(checklist.trip_id))
        )
      )
  )
);

drop policy if exists checklist_items_update_policy on public.checklist_items;
create policy checklist_items_update_policy
on public.checklist_items
for update
to authenticated
using (
  exists (
    select 1
    from public.checklists as checklist
    where checklist.id = checklist_items.checklist_id
      and (
        (
          checklist.scope = 'shared'
          and (select public.tc_can_edit_shared_checklist(checklist.trip_id))
        )
        or (
          checklist.scope = 'private'
          and (select auth.uid()) is not null
          and checklist.owner_user_id = (select auth.uid())
          and (select public.tc_can_sync_private_checklist(checklist.trip_id))
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.checklists as checklist
    where checklist.id = checklist_items.checklist_id
      and (
        (
          checklist.scope = 'shared'
          and (select public.tc_can_edit_shared_checklist(checklist.trip_id))
        )
        or (
          checklist.scope = 'private'
          and (select auth.uid()) is not null
          and checklist.owner_user_id = (select auth.uid())
          and (select public.tc_can_sync_private_checklist(checklist.trip_id))
        )
      )
  )
);

drop policy if exists checklist_items_delete_policy on public.checklist_items;
create policy checklist_items_delete_policy
on public.checklist_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.checklists as checklist
    where checklist.id = checklist_items.checklist_id
      and (
        (
          checklist.scope = 'shared'
          and (select public.tc_can_edit_shared_checklist(checklist.trip_id))
        )
        or (
          checklist.scope = 'private'
          and (select auth.uid()) is not null
          and checklist.owner_user_id = (select auth.uid())
          and (select public.tc_can_sync_private_checklist(checklist.trip_id))
        )
      )
  )
);

drop policy if exists other_info_items_select_policy on public.other_info_items;
create policy other_info_items_select_policy
on public.other_info_items
for select
to anon, authenticated
using (
  (deleted_at is null or (select public.tc_can_edit_other_info(trip_id)))
  and (
    allowed_roles is null
    or cardinality(allowed_roles) = 0
    or allowed_roles @> array[(select public.tc_other_info_role(trip_id))]::text[]
  )
);

drop policy if exists other_info_items_insert_policy on public.other_info_items;
create policy other_info_items_insert_policy
on public.other_info_items
for insert
to authenticated
with check (
  (select auth.uid()) is not null
  and (select public.tc_can_edit_other_info(trip_id))
);

drop policy if exists other_info_items_update_policy on public.other_info_items;
create policy other_info_items_update_policy
on public.other_info_items
for update
to authenticated
using (
  (select auth.uid()) is not null
  and (select public.tc_can_edit_other_info(trip_id))
)
with check (
  (select auth.uid()) is not null
  and (select public.tc_can_edit_other_info(trip_id))
);

drop policy if exists other_info_items_delete_policy on public.other_info_items;
create policy other_info_items_delete_policy
on public.other_info_items
for delete
to authenticated
using (
  (select auth.uid()) is not null
  and (select public.tc_can_edit_other_info(trip_id))
);

drop policy if exists exchange_purchases_select_policy on public.exchange_purchases;
create policy exchange_purchases_select_policy
on public.exchange_purchases
for select
to authenticated
using (
  (select public.tc_is_super_admin())
  or (select public.tc_is_trip_editor(trip_id))
);

drop policy if exists exchange_purchases_insert_policy on public.exchange_purchases;
create policy exchange_purchases_insert_policy
on public.exchange_purchases
for insert
to authenticated
with check ((select public.tc_can_write_shared_trip(trip_id)));

drop policy if exists exchange_purchases_update_policy on public.exchange_purchases;
create policy exchange_purchases_update_policy
on public.exchange_purchases
for update
to authenticated
using ((select public.tc_can_write_shared_trip(trip_id)))
with check ((select public.tc_can_write_shared_trip(trip_id)));

drop policy if exists exchange_purchases_delete_policy on public.exchange_purchases;
create policy exchange_purchases_delete_policy
on public.exchange_purchases
for delete
to authenticated
using ((select public.tc_can_write_shared_trip(trip_id)));

-- Remove broad default privileges inherited by the clean local bootstrap and
-- restore only the Data API operations used by the application.
revoke all on table public.checklists, public.checklist_items,
  public.other_info_items, public.exchange_purchases from anon, authenticated;

grant select on table public.checklists, public.checklist_items,
  public.other_info_items to anon, authenticated;
grant insert, update, delete on table public.checklists,
  public.checklist_items, public.other_info_items to authenticated;
grant select, insert, update, delete on table public.exchange_purchases
  to authenticated;

commit;
