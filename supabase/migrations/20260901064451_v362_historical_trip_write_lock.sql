-- Travel Companion V3.6.2 historical Trip shared-data write lock
--
-- A trip_editor may write shared data through the final Taiwan calendar day
-- of a Trip. From the next Taiwan midnight onward only super_admin may write.
-- The lookup deliberately uses the currently stored Trip row, so changing the
-- date and content in the same request cannot bypass the lock.

begin;

create or replace function private.tc_can_write_shared_trip(target_trip_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.tc_is_super_admin()
    or (
      private.tc_is_trip_editor(target_trip_id)
      and exists (
        select 1
        from public.trips as trip
        where trip.id = target_trip_id
          and (
            trip.departure_date
            + greatest(
                case
                  when jsonb_typeof(trip.content -> 'days') = 'array'
                    then jsonb_array_length(trip.content -> 'days')
                  else 1
                end,
                1
              )
            - 1
          ) >= (now() at time zone 'Asia/Taipei')::date
      )
    );
$$;

revoke all on function private.tc_can_write_shared_trip(text)
  from public, anon, authenticated;
grant execute on function private.tc_can_write_shared_trip(text)
  to anon, authenticated;

create or replace function public.tc_can_write_shared_trip(target_trip_id text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.tc_can_write_shared_trip(target_trip_id);
$$;

revoke all on function public.tc_can_write_shared_trip(text)
  from public, anon, authenticated;
grant execute on function public.tc_can_write_shared_trip(text)
  to anon, authenticated;

-- The trigger makes the "stored row before this update" boundary explicit.
-- RLS already calls the same stored-row helper; this provides a stable error
-- and prevents a single request from moving a historical Trip into the future
-- before the role check is evaluated.
create or replace function private.tc_reject_historical_trip_editor_update()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  stored_day_count integer;
  stored_end_date date;
begin
  if private.tc_is_super_admin() then
    return new;
  end if;

  stored_day_count := greatest(
    case
      when jsonb_typeof(old.content -> 'days') = 'array'
        then jsonb_array_length(old.content -> 'days')
      else 1
    end,
    1
  );
  stored_end_date := old.departure_date + stored_day_count - 1;

  if private.tc_is_trip_editor(old.id)
    and stored_end_date < (now() at time zone 'Asia/Taipei')::date
  then
    raise exception using
      errcode = '42501',
      message = 'Historical trip is locked for trip_editor';
  end if;

  return new;
end;
$$;

revoke all on function private.tc_reject_historical_trip_editor_update()
  from public, anon, authenticated;

drop trigger if exists trips_reject_historical_trip_editor_update on public.trips;
create trigger trips_reject_historical_trip_editor_update
before update on public.trips
for each row
execute function private.tc_reject_historical_trip_editor_update();

-- Existing shared checklist policies call this helper. Private checklist
-- policies intentionally continue using tc_can_sync_private_checklist.
create or replace function public.tc_can_edit_shared_checklist(target_trip_id text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.tc_can_write_shared_trip(target_trip_id);
$$;

create or replace function public.tc_can_edit_other_info(target_trip_id text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select public.tc_can_write_shared_trip(target_trip_id);
$$;

revoke all on function public.tc_can_edit_shared_checklist(text)
  from public, anon, authenticated;
revoke all on function public.tc_can_edit_other_info(text)
  from public, anon, authenticated;
grant execute on function public.tc_can_edit_shared_checklist(text)
  to anon, authenticated;
grant execute on function public.tc_can_edit_other_info(text)
  to anon, authenticated;

drop policy if exists trips_update_policy on public.trips;
create policy trips_update_policy
on public.trips
for update
to authenticated
using ((select public.tc_can_write_shared_trip(id)))
with check ((select public.tc_can_write_shared_trip(id)));

drop policy if exists expenses_insert_policy on public.expenses;
create policy expenses_insert_policy
on public.expenses for insert to authenticated
with check (
  (select public.tc_can_write_shared_trip(trip_id))
  and owner_user_id = (select auth.uid())
);

drop policy if exists expenses_update_policy on public.expenses;
create policy expenses_update_policy
on public.expenses for update to authenticated
using (
  (select public.tc_is_super_admin())
  or (
    (select public.tc_can_write_shared_trip(trip_id))
    and (owner_user_id = (select auth.uid()) or owner_user_id is null)
  )
)
with check (
  (select public.tc_is_super_admin())
  or (
    (select public.tc_can_write_shared_trip(trip_id))
    and (owner_user_id = (select auth.uid()) or owner_user_id is null)
  )
);

drop policy if exists expenses_delete_policy on public.expenses;
create policy expenses_delete_policy
on public.expenses for delete to authenticated
using (
  (select public.tc_is_super_admin())
  or (
    (select public.tc_can_write_shared_trip(trip_id))
    and (owner_user_id = (select auth.uid()) or owner_user_id is null)
  )
);

drop policy if exists exchange_purchases_insert_policy on public.exchange_purchases;
create policy exchange_purchases_insert_policy
on public.exchange_purchases for insert to authenticated
with check ((select public.tc_can_write_shared_trip(trip_id)));

drop policy if exists exchange_purchases_update_policy on public.exchange_purchases;
create policy exchange_purchases_update_policy
on public.exchange_purchases for update to authenticated
using ((select public.tc_can_write_shared_trip(trip_id)))
with check ((select public.tc_can_write_shared_trip(trip_id)));

drop policy if exists exchange_purchases_delete_policy on public.exchange_purchases;
create policy exchange_purchases_delete_policy
on public.exchange_purchases for delete to authenticated
using ((select public.tc_can_write_shared_trip(trip_id)));

drop policy if exists expense_attachments_insert_v351 on storage.objects;
create policy expense_attachments_insert_v351
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'expense-attachments'
  and array_length(storage.foldername(name), 1) = 2
  and exists (
    select 1
    from public.expenses as expense
    where public.tc_attachment_storage_scope(expense.trip_id) = (storage.foldername(name))[1]
      and public.tc_attachment_storage_scope(expense.id::text) = (storage.foldername(name))[2]
      and (
        (select public.tc_is_super_admin())
        or (
          (select public.tc_can_write_shared_trip(expense.trip_id))
          and (
            expense.owner_user_id = (select auth.uid())
            or expense.owner_user_id is null
          )
        )
      )
  )
);

drop policy if exists expense_attachments_update_v351 on storage.objects;
create policy expense_attachments_update_v351
on storage.objects
for update
to authenticated
using (
  bucket_id = 'expense-attachments'
  and array_length(storage.foldername(name), 1) = 2
  and (
    (select public.tc_is_super_admin())
    or exists (
      select 1
      from public.expenses as expense
      where public.tc_attachment_storage_scope(expense.trip_id) = (storage.foldername(name))[1]
        and (select public.tc_can_write_shared_trip(expense.trip_id))
    )
  )
)
with check (
  bucket_id = 'expense-attachments'
  and array_length(storage.foldername(name), 1) = 2
  and exists (
    select 1
    from public.expenses as expense
    where public.tc_attachment_storage_scope(expense.trip_id) = (storage.foldername(name))[1]
      and public.tc_attachment_storage_scope(expense.id::text) = (storage.foldername(name))[2]
      and (
        (select public.tc_is_super_admin())
        or (
          (select public.tc_can_write_shared_trip(expense.trip_id))
          and (
            expense.owner_user_id = (select auth.uid())
            or expense.owner_user_id is null
          )
        )
      )
  )
);

drop policy if exists expense_attachments_delete_v351 on storage.objects;
create policy expense_attachments_delete_v351
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'expense-attachments'
  and array_length(storage.foldername(name), 1) = 2
  and (
    (select public.tc_is_super_admin())
    or exists (
      select 1
      from public.expenses as expense
      where public.tc_attachment_storage_scope(expense.trip_id) = (storage.foldername(name))[1]
        and (select public.tc_can_write_shared_trip(expense.trip_id))
        and (
          owner_id = (select auth.uid()::text)
          or expense.owner_user_id = (select auth.uid())
          or expense.owner_user_id is null
        )
    )
  )
);

commit;
