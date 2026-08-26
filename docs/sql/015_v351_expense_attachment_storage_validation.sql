-- Run after 20260826042333_v351_expense_attachment_storage_security.sql.

select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'expense-attachments';

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname like 'expense_attachments_%_v351'
order by policyname;

select
  count(*) filter (
    where array_length(storage.foldername(name), 1) <> 2
  ) as invalid_folder_depth,
  count(*) filter (
    where not exists (
      select 1
      from public.expenses as expense
      where public.tc_attachment_storage_scope(expense.trip_id) = (storage.foldername(objects.name))[1]
        and public.tc_attachment_storage_scope(expense.id::text) = (storage.foldername(objects.name))[2]
    )
  ) as orphan_or_mismatched_paths,
  count(*) as total_objects
from storage.objects as objects
where bucket_id = 'expense-attachments';

-- Role verification is completed through the Storage API so the file bytes
-- and metadata stay consistent. Verify each role against the same test path:
--   <trip_id>/<expense_id>/v351-role-check.jpg
-- 1. anon and an editor assigned to another Trip: list/upload/sign/remove fail.
-- 2. assigned trip_editor: own expense upload/upsert/sign/remove succeed.
-- 3. assigned trip_editor: another owner's upload/upsert fail; sign succeeds.
-- 4. super_admin: upload/upsert/sign/remove succeed.
