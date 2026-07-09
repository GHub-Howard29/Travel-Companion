-- Travel Companion V3-1 Checklist Cloud Schema
-- Updated: 2026-07-09
--
-- Purpose:
-- - Add Supabase tables for shared and private checklists.
-- - Keep trip_editor / super_admin assignment data-driven through admin_users.
-- - Ensure private checklist rows are only readable by the creator.
--
-- Assumptions:
-- - public.admin_users already exists with: email, role, trip_id.
-- - role values use: super_admin, trip_editor.
-- - trip_id values match public/trips/*.json ids.

create extension if not exists pgcrypto;

create or replace function public.tc_current_email()
returns text
language sql
stable
as $$
  select coalesce(nullif(auth.jwt() ->> 'email', ''), '');
$$;

create or replace function public.tc_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where email = public.tc_current_email()
      and role = 'super_admin'
  );
$$;

create or replace function public.tc_is_trip_editor(target_trip_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_users
    where email = public.tc_current_email()
      and role = 'trip_editor'
      and trip_id = target_trip_id
  );
$$;

create or replace function public.tc_can_edit_shared_checklist(target_trip_id text)
returns boolean
language sql
stable
as $$
  select public.tc_is_super_admin()
    or public.tc_is_trip_editor(target_trip_id);
$$;

create or replace function public.tc_can_sync_private_checklist(target_trip_id text)
returns boolean
language sql
stable
as $$
  select public.tc_is_super_admin()
    or public.tc_is_trip_editor(target_trip_id);
$$;

create table if not exists public.checklists (
  id uuid primary key default gen_random_uuid(),
  trip_id text not null,
  scope text not null check (scope in ('shared', 'private')),
  owner_user_id uuid null references auth.users(id) on delete cascade,
  title text not null default '確認清單',
  created_by uuid null default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint checklists_scope_owner_check check (
    (scope = 'shared' and owner_user_id is null)
    or
    (scope = 'private' and owner_user_id is not null)
  )
);

create unique index if not exists checklists_one_shared_per_trip
on public.checklists (trip_id)
where scope = 'shared';

create unique index if not exists checklists_one_private_per_trip_owner
on public.checklists (trip_id, owner_user_id)
where scope = 'private';

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  label text not null,
  is_checked boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid null default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null
);

create index if not exists checklist_items_checklist_order
on public.checklist_items (checklist_id, sort_order, created_at);

create or replace function public.tc_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.tc_prevent_checklist_identity_update()
returns trigger
language plpgsql
as $$
begin
  if old.trip_id is distinct from new.trip_id
    or old.scope is distinct from new.scope
    or old.owner_user_id is distinct from new.owner_user_id
  then
    raise exception 'checklist identity fields cannot be changed';
  end if;

  return new;
end;
$$;

drop trigger if exists checklists_touch_updated_at on public.checklists;
create trigger checklists_touch_updated_at
before update on public.checklists
for each row
execute function public.tc_touch_updated_at();

drop trigger if exists checklists_prevent_identity_update on public.checklists;
create trigger checklists_prevent_identity_update
before update on public.checklists
for each row
execute function public.tc_prevent_checklist_identity_update();

drop trigger if exists checklist_items_touch_updated_at on public.checklist_items;
create trigger checklist_items_touch_updated_at
before update on public.checklist_items
for each row
execute function public.tc_touch_updated_at();

alter table public.checklists enable row level security;
alter table public.checklist_items enable row level security;

drop policy if exists checklists_select_policy on public.checklists;
create policy checklists_select_policy
on public.checklists
for select
using (
  scope = 'shared'
  or (
    scope = 'private'
    and auth.uid() is not null
    and owner_user_id = auth.uid()
    and public.tc_can_sync_private_checklist(trip_id)
  )
);

drop policy if exists checklists_insert_policy on public.checklists;
create policy checklists_insert_policy
on public.checklists
for insert
with check (
  (
    scope = 'shared'
    and owner_user_id is null
    and public.tc_can_edit_shared_checklist(trip_id)
  )
  or (
    scope = 'private'
    and auth.uid() is not null
    and owner_user_id = auth.uid()
    and created_by = auth.uid()
    and public.tc_can_sync_private_checklist(trip_id)
  )
);

drop policy if exists checklists_update_policy on public.checklists;
create policy checklists_update_policy
on public.checklists
for update
using (
  (
    scope = 'shared'
    and public.tc_can_edit_shared_checklist(trip_id)
  )
  or (
    scope = 'private'
    and auth.uid() is not null
    and owner_user_id = auth.uid()
    and public.tc_can_sync_private_checklist(trip_id)
  )
)
with check (
  (
    scope = 'shared'
    and owner_user_id is null
    and public.tc_can_edit_shared_checklist(trip_id)
  )
  or (
    scope = 'private'
    and auth.uid() is not null
    and owner_user_id = auth.uid()
    and public.tc_can_sync_private_checklist(trip_id)
  )
);

drop policy if exists checklists_delete_policy on public.checklists;
create policy checklists_delete_policy
on public.checklists
for delete
using (
  (
    scope = 'shared'
    and public.tc_can_edit_shared_checklist(trip_id)
  )
  or (
    scope = 'private'
    and auth.uid() is not null
    and owner_user_id = auth.uid()
    and public.tc_can_sync_private_checklist(trip_id)
  )
);

drop policy if exists checklist_items_select_policy on public.checklist_items;
create policy checklist_items_select_policy
on public.checklist_items
for select
using (
  exists (
    select 1
    from public.checklists c
    where c.id = checklist_items.checklist_id
      and (
        c.scope = 'shared'
        or (
          c.scope = 'private'
          and auth.uid() is not null
          and c.owner_user_id = auth.uid()
          and public.tc_can_sync_private_checklist(c.trip_id)
        )
      )
  )
);

drop policy if exists checklist_items_insert_policy on public.checklist_items;
create policy checklist_items_insert_policy
on public.checklist_items
for insert
with check (
  exists (
    select 1
    from public.checklists c
    where c.id = checklist_items.checklist_id
      and (
        (
          c.scope = 'shared'
          and public.tc_can_edit_shared_checklist(c.trip_id)
        )
        or (
          c.scope = 'private'
          and auth.uid() is not null
          and c.owner_user_id = auth.uid()
          and created_by = auth.uid()
          and public.tc_can_sync_private_checklist(c.trip_id)
        )
      )
  )
);

drop policy if exists checklist_items_update_policy on public.checklist_items;
create policy checklist_items_update_policy
on public.checklist_items
for update
using (
  exists (
    select 1
    from public.checklists c
    where c.id = checklist_items.checklist_id
      and (
        (
          c.scope = 'shared'
          and public.tc_can_edit_shared_checklist(c.trip_id)
        )
        or (
          c.scope = 'private'
          and auth.uid() is not null
          and c.owner_user_id = auth.uid()
          and public.tc_can_sync_private_checklist(c.trip_id)
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.checklists c
    where c.id = checklist_items.checklist_id
      and (
        (
          c.scope = 'shared'
          and public.tc_can_edit_shared_checklist(c.trip_id)
        )
        or (
          c.scope = 'private'
          and auth.uid() is not null
          and c.owner_user_id = auth.uid()
          and public.tc_can_sync_private_checklist(c.trip_id)
        )
      )
  )
);

drop policy if exists checklist_items_delete_policy on public.checklist_items;
create policy checklist_items_delete_policy
on public.checklist_items
for delete
using (
  exists (
    select 1
    from public.checklists c
    where c.id = checklist_items.checklist_id
      and (
        (
          c.scope = 'shared'
          and public.tc_can_edit_shared_checklist(c.trip_id)
        )
        or (
          c.scope = 'private'
          and auth.uid() is not null
          and c.owner_user_id = auth.uid()
          and public.tc_can_sync_private_checklist(c.trip_id)
        )
      )
  )
);

grant execute on function public.tc_current_email() to anon, authenticated;
grant execute on function public.tc_is_super_admin() to anon, authenticated;
grant execute on function public.tc_is_trip_editor(text) to anon, authenticated;
grant execute on function public.tc_can_edit_shared_checklist(text) to anon, authenticated;
grant execute on function public.tc_can_sync_private_checklist(text) to anon, authenticated;

grant select on public.checklists to anon, authenticated;
grant select on public.checklist_items to anon, authenticated;
grant insert, update, delete on public.checklists to authenticated;
grant insert, update, delete on public.checklist_items to authenticated;
