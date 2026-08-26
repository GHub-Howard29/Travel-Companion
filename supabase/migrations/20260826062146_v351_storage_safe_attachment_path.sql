-- V3.5.1 follow-up: Supabase Storage can reject Unicode object keys.
-- Encode scope folders as UTF-8 hex while retaining deterministic RLS checks
-- against the original Trip and expense identifiers.

create or replace function public.tc_attachment_storage_scope(value text)
returns text
language sql
immutable
strict
set search_path = ''
as $$
  select 's_' || encode(convert_to(value, 'UTF8'), 'hex')
$$;

drop policy if exists expense_attachments_select_v351 on storage.objects;
drop policy if exists expense_attachments_insert_v351 on storage.objects;
drop policy if exists expense_attachments_update_v351 on storage.objects;
drop policy if exists expense_attachments_delete_v351 on storage.objects;

create policy expense_attachments_select_v351
on storage.objects
for select
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
        and (select public.tc_is_trip_editor(expense.trip_id))
    )
  )
);

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
          (select public.tc_is_trip_editor(expense.trip_id))
          and (
            expense.owner_user_id = (select auth.uid())
            or expense.owner_user_id is null
          )
        )
      )
  )
);

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
        and (select public.tc_is_trip_editor(expense.trip_id))
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
          (select public.tc_is_trip_editor(expense.trip_id))
          and (
            expense.owner_user_id = (select auth.uid())
            or expense.owner_user_id is null
          )
        )
      )
  )
);

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
        and (
          owner_id = (select auth.uid()::text)
          or (
            (select public.tc_is_trip_editor(expense.trip_id))
            and (
              expense.owner_user_id = (select auth.uid())
              or expense.owner_user_id is null
            )
          )
        )
    )
  )
);
