-- Travel Companion V3.4.1 Expense ownership and A+B merge schema
-- Updated: 2026-08-11
--
-- Apply this script before deploying the V3.4.1 frontend.
-- It separates the authenticated record owner from the selectable payer.

alter table if exists public.expenses
  add column if not exists client_item_id text,
  add column if not exists owner_user_id uuid default auth.uid()
    references auth.users(id) on delete set null,
  add column if not exists recorded_by_email text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz;

update public.expenses
set client_item_id = 'legacy_' || id::text
where client_item_id is null;

alter table public.expenses
  alter column client_item_id set not null;

create unique index if not exists expenses_one_client_item_per_trip
on public.expenses (trip_id, client_item_id);

create index if not exists expenses_trip_owner_idx
on public.expenses (trip_id, owner_user_id);

create index if not exists expenses_trip_active_created_idx
on public.expenses (trip_id, created_at)
where deleted_at is null;

create or replace function public.tc_prevent_expense_identity_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.trip_id is distinct from old.trip_id then
    raise exception 'Cannot change expense trip_id';
  end if;
  if new.client_item_id is distinct from old.client_item_id then
    raise exception 'Cannot change expense client_item_id';
  end if;
  if new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'Cannot change expense owner_user_id';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_touch_updated_at on public.expenses;
create trigger expenses_touch_updated_at
before update on public.expenses
for each row execute function public.tc_touch_updated_at();

drop trigger if exists expenses_prevent_identity_update on public.expenses;
create trigger expenses_prevent_identity_update
before update on public.expenses
for each row execute function public.tc_prevent_expense_identity_update();

alter table public.expenses enable row level security;

-- Remove legacy permissive policies before replacing them with ownership rules.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'expenses'
  loop
    execute format(
      'drop policy if exists %I on public.expenses',
      policy_record.policyname
    );
  end loop;
end;
$$;

create policy expenses_select_policy
on public.expenses for select to authenticated
using (
  public.tc_is_super_admin()
  or public.tc_is_trip_editor(trip_id)
);

create policy expenses_insert_policy
on public.expenses for insert to authenticated
with check (
  (public.tc_is_super_admin() or public.tc_is_trip_editor(trip_id))
  and owner_user_id = (select auth.uid())
);

create policy expenses_update_policy
on public.expenses for update to authenticated
using (
  public.tc_is_super_admin()
  or (
    public.tc_is_trip_editor(trip_id)
    and (owner_user_id = (select auth.uid()) or owner_user_id is null)
  )
)
with check (
  public.tc_is_super_admin()
  or (
    public.tc_is_trip_editor(trip_id)
    and (owner_user_id = (select auth.uid()) or owner_user_id is null)
  )
);

create policy expenses_delete_policy
on public.expenses for delete to authenticated
using (
  public.tc_is_super_admin()
  or (
    public.tc_is_trip_editor(trip_id)
    and (owner_user_id = (select auth.uid()) or owner_user_id is null)
  )
);

revoke all on public.expenses from anon;
revoke all on public.expenses from authenticated;
grant select, insert, update, delete on public.expenses to authenticated;

