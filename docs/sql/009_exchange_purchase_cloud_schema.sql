-- Travel Companion V3.3.0 Exchange Purchase Cloud Schema
-- Updated: 2026-07-20
--
-- Cloud history is intentionally limited to the Trip editor assigned to the
-- trip and super administrators. Guests and normal users use local storage.

create extension if not exists pgcrypto;

create table if not exists public.exchange_purchases (
  id uuid primary key default gen_random_uuid(),
  trip_id text not null,
  client_item_id text not null,
  foreign_currency text not null check (foreign_currency in ('JPY', 'KRW', 'USD', 'EUR')),
  purchase_date date not null,
  twd_amount numeric(14, 2) not null check (twd_amount > 0),
  foreign_amount numeric(18, 4) not null check (foreign_amount > 0),
  created_by uuid null default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (trip_id, client_item_id)
);

create index if not exists exchange_purchases_trip_currency_date_idx
on public.exchange_purchases (trip_id, foreign_currency, purchase_date desc, created_at desc);

create or replace function public.tc_prevent_exchange_purchase_identity_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.trip_id <> old.trip_id then
    raise exception 'Cannot change exchange purchase trip_id';
  end if;
  if new.client_item_id <> old.client_item_id then
    raise exception 'Cannot change exchange purchase client_item_id';
  end if;
  return new;
end;
$$;

drop trigger if exists exchange_purchases_touch_updated_at on public.exchange_purchases;
create trigger exchange_purchases_touch_updated_at
before update on public.exchange_purchases
for each row execute function public.tc_touch_updated_at();

drop trigger if exists exchange_purchases_prevent_identity_update on public.exchange_purchases;
create trigger exchange_purchases_prevent_identity_update
before update on public.exchange_purchases
for each row execute function public.tc_prevent_exchange_purchase_identity_update();

alter table public.exchange_purchases enable row level security;

drop policy if exists exchange_purchases_select_policy on public.exchange_purchases;
create policy exchange_purchases_select_policy on public.exchange_purchases
for select to authenticated
using (public.tc_is_super_admin() or public.tc_is_trip_editor(trip_id));

drop policy if exists exchange_purchases_insert_policy on public.exchange_purchases;
create policy exchange_purchases_insert_policy on public.exchange_purchases
for insert to authenticated
with check (public.tc_is_super_admin() or public.tc_is_trip_editor(trip_id));

drop policy if exists exchange_purchases_update_policy on public.exchange_purchases;
create policy exchange_purchases_update_policy on public.exchange_purchases
for update to authenticated
using (public.tc_is_super_admin() or public.tc_is_trip_editor(trip_id))
with check (public.tc_is_super_admin() or public.tc_is_trip_editor(trip_id));

drop policy if exists exchange_purchases_delete_policy on public.exchange_purchases;
create policy exchange_purchases_delete_policy on public.exchange_purchases
for delete to authenticated
using (public.tc_is_super_admin() or public.tc_is_trip_editor(trip_id));

revoke all on public.exchange_purchases from anon;
revoke all on public.exchange_purchases from authenticated;
grant select, insert, update, delete on public.exchange_purchases to authenticated;
