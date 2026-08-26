-- Travel Companion V3.5.1 expense attachment Storage security
--
-- Object path contract:
--   <trip_id>/<expense_id>/<timestamp>-<sanitized-file-name>
--
-- The application only exposes cloud expense books to the assigned
-- trip_editor and super_admin roles. Storage follows the same Trip boundary;
-- it does not introduce an additional sensitive-attachment visibility level.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'expense-attachments',
  'expense-attachments',
  false,
  1048576,
  array[
    'image/avif',
    'image/gif',
    'image/heic',
    'image/heif',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Remove legacy dashboard policies that mention this bucket so a permissive
-- policy cannot be OR-combined with the V3.5.1 rules below.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ilike '%expense-attachments%'
        or coalesce(with_check, '') ilike '%expense-attachments%'
      )
  loop
    execute format(
      'drop policy if exists %I on storage.objects',
      policy_record.policyname
    );
  end loop;
end;
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
    or (select public.tc_is_trip_editor((storage.foldername(name))[1]))
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
    where expense.trip_id = (storage.foldername(name))[1]
      and expense.id::text = (storage.foldername(name))[2]
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
    or (select public.tc_is_trip_editor((storage.foldername(name))[1]))
  )
)
with check (
  bucket_id = 'expense-attachments'
  and array_length(storage.foldername(name), 1) = 2
  and exists (
    select 1
    from public.expenses as expense
    where expense.trip_id = (storage.foldername(name))[1]
      and expense.id::text = (storage.foldername(name))[2]
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
    or (
      (select public.tc_is_trip_editor((storage.foldername(name))[1]))
      and (
        owner_id = (select auth.uid()::text)
        or exists (
          select 1
          from public.expenses as expense
          where expense.trip_id = (storage.foldername(name))[1]
            and expense.id::text = (storage.foldername(name))[2]
            and (
              expense.owner_user_id = (select auth.uid())
              or expense.owner_user_id is null
            )
        )
      )
    )
  )
);
