-- V3.5.1 Storage RLS four-role regression.
--
-- Run only through a privileged Supabase database connection. This script
-- creates all fixtures inside one transaction and ends with ROLLBACK, so it
-- leaves no admin role, expense, or storage metadata behind.
--
-- Note: direct DELETE against storage.objects is deliberately blocked by
-- Storage's protect_objects_delete trigger. Deletion must be exercised through
-- the Storage HTTP API with a real authenticated session; this SQL regression
-- therefore verifies the delete policy is present, and fully exercises the
-- RLS-controlled select, insert, and update operations.

begin;

create temporary table v351_storage_rls_results (
  role_name text not null,
  operation text not null,
  passed boolean not null,
  detail text not null
) on commit drop;

grant all on table v351_storage_rls_results to anon, authenticated;

do $$
declare
  target_editor_id uuid;
  target_editor_email text;
  other_editor_id uuid;
  other_editor_email text;
  super_admin_id uuid;
  super_admin_email text;
  test_trip_id text := 'v351-storage-rls-regression';
  other_trip_id text := 'v351-storage-rls-other-trip';
  own_expense_id bigint := -910000000001;
  other_expense_id bigint := -910000000002;
  own_path text;
  other_path text;
  own_write_path text;
  super_write_path text;
  matched_count integer;
  affected_count integer;
  failure_detail text;
begin
  select u.id, lower(u.email)
  into target_editor_id, target_editor_email
  from auth.users as u
  where u.email is not null
    and not exists (
      select 1
      from public.admin_users as admin
      where lower(admin.email) = lower(u.email)
    )
  order by u.created_at
  limit 1;

  select u.id, lower(u.email)
  into other_editor_id, other_editor_email
  from auth.users as u
  where u.email is not null
    and u.id <> target_editor_id
    and not exists (
      select 1
      from public.admin_users as admin
      where lower(admin.email) = lower(u.email)
    )
  order by u.created_at
  limit 1;

  select u.id, lower(u.email)
  into super_admin_id, super_admin_email
  from auth.users as u
  join public.admin_users as admin
    on lower(admin.email) = lower(u.email)
   and admin.role = 'super_admin'
  order by u.created_at
  limit 1;

  if target_editor_id is null or other_editor_id is null or super_admin_id is null then
    raise exception 'V3.5.1 Storage RLS fixtures require two no-role auth users and one super admin.';
  end if;

  insert into public.admin_users (email, role, trip_id)
  values
    (target_editor_email, 'trip_editor', test_trip_id),
    (other_editor_email, 'trip_editor', other_trip_id);

  insert into public.expenses (
    id, trip_id, title, amount, payer, currency, client_item_id, owner_user_id, recorded_by_email
  )
  values
    (own_expense_id, test_trip_id, 'V3.5.1 RLS own fixture', 1, 'RLS', 'TWD', 'v351-storage-own', target_editor_id, target_editor_email),
    (other_expense_id, test_trip_id, 'V3.5.1 RLS other fixture', 1, 'RLS', 'TWD', 'v351-storage-other', super_admin_id, super_admin_email);

  own_path := public.tc_attachment_storage_scope(test_trip_id)
    || '/' || public.tc_attachment_storage_scope(own_expense_id::text) || '/existing.jpg';
  other_path := public.tc_attachment_storage_scope(test_trip_id)
    || '/' || public.tc_attachment_storage_scope(other_expense_id::text) || '/existing.jpg';
  own_write_path := public.tc_attachment_storage_scope(test_trip_id)
    || '/' || public.tc_attachment_storage_scope(own_expense_id::text) || '/editor-write.jpg';
  super_write_path := public.tc_attachment_storage_scope(test_trip_id)
    || '/' || public.tc_attachment_storage_scope(other_expense_id::text) || '/super-write.jpg';

  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values
    ('expense-attachments', own_path, target_editor_id::text, '{"mimetype":"image/jpeg","size":1}'::jsonb),
    ('expense-attachments', other_path, super_admin_id::text, '{"mimetype":"image/jpeg","size":1}'::jsonb);

  -- anon: no object visibility or writes.
  perform set_config('request.jwt.claims', '{}', true);
  execute 'set local role anon';
  select count(*) into matched_count from storage.objects where bucket_id = 'expense-attachments' and name = own_path;
  insert into v351_storage_rls_results values ('anon', 'select/sign', matched_count = 0, 'visible rows=' || matched_count);
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('expense-attachments', own_write_path, '{"mimetype":"image/jpeg","size":1}'::jsonb);
    insert into v351_storage_rls_results values ('anon', 'insert', false, 'insert unexpectedly succeeded');
  exception when others then
    insert into v351_storage_rls_results values ('anon', 'insert', true, sqlerrm);
  end;
  execute 'reset role';

  -- Other Trip editor: target Trip is entirely inaccessible.
  perform set_config('request.jwt.claims', json_build_object('sub', other_editor_id, 'email', other_editor_email)::text, true);
  execute 'set local role authenticated';
  select count(*) into matched_count from storage.objects where bucket_id = 'expense-attachments' and name = own_path;
  insert into v351_storage_rls_results values ('other_trip_editor', 'select/sign', matched_count = 0, 'visible rows=' || matched_count);
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('expense-attachments', own_write_path, '{"mimetype":"image/jpeg","size":1}'::jsonb);
    insert into v351_storage_rls_results values ('other_trip_editor', 'insert', false, 'insert unexpectedly succeeded');
  exception when others then
    insert into v351_storage_rls_results values ('other_trip_editor', 'insert', true, sqlerrm);
  end;
  execute 'reset role';

  -- Assigned Trip editor: may manage own expense, but may only read/sign another owner's attachment.
  perform set_config('request.jwt.claims', json_build_object('sub', target_editor_id, 'email', target_editor_email)::text, true);
  execute 'set local role authenticated';
  select count(*) into matched_count from storage.objects where bucket_id = 'expense-attachments' and name in (own_path, other_path);
  insert into v351_storage_rls_results values ('assigned_trip_editor', 'select/sign', matched_count = 2, 'visible rows=' || matched_count);
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('expense-attachments', own_write_path, target_editor_id::text, '{"mimetype":"image/jpeg","size":1}'::jsonb);
  insert into v351_storage_rls_results values ('assigned_trip_editor', 'insert own', true, 'insert succeeded');
  update storage.objects set metadata = '{"mimetype":"image/jpeg","size":2}'::jsonb where bucket_id = 'expense-attachments' and name = own_write_path;
  get diagnostics affected_count = row_count;
  insert into v351_storage_rls_results values ('assigned_trip_editor', 'update own', affected_count = 1, 'updated rows=' || affected_count);
  begin
    insert into storage.objects (bucket_id, name, metadata)
    values ('expense-attachments', super_write_path, '{"mimetype":"image/jpeg","size":1}'::jsonb);
    insert into v351_storage_rls_results values ('assigned_trip_editor', 'insert other owner', false, 'insert unexpectedly succeeded');
  exception when others then
    insert into v351_storage_rls_results values ('assigned_trip_editor', 'insert other owner', true, sqlerrm);
  end;
  begin
    update storage.objects set metadata = '{"mimetype":"image/jpeg","size":2}'::jsonb where bucket_id = 'expense-attachments' and name = other_path;
    get diagnostics affected_count = row_count;
    insert into v351_storage_rls_results values ('assigned_trip_editor', 'update other owner', affected_count = 0, 'updated rows=' || affected_count);
  exception when others then
    insert into v351_storage_rls_results values ('assigned_trip_editor', 'update other owner', true, sqlerrm);
  end;
  execute 'reset role';

  -- Super admin: full Storage metadata access to the target Trip.
  perform set_config('request.jwt.claims', json_build_object('sub', super_admin_id, 'email', super_admin_email)::text, true);
  execute 'set local role authenticated';
  select count(*) into matched_count from storage.objects where bucket_id = 'expense-attachments' and name in (own_path, other_path);
  insert into v351_storage_rls_results values ('super_admin', 'select/sign', matched_count = 2, 'visible rows=' || matched_count);
  insert into storage.objects (bucket_id, name, owner_id, metadata)
  values ('expense-attachments', super_write_path, super_admin_id::text, '{"mimetype":"image/jpeg","size":1}'::jsonb);
  insert into v351_storage_rls_results values ('super_admin', 'insert', true, 'insert succeeded');
  update storage.objects set metadata = '{"mimetype":"image/jpeg","size":2}'::jsonb where bucket_id = 'expense-attachments' and name = super_write_path;
  get diagnostics affected_count = row_count;
  insert into v351_storage_rls_results values ('super_admin', 'update', affected_count = 1, 'updated rows=' || affected_count);
  execute 'reset role';
end
$$;

insert into v351_storage_rls_results
select
  'policy_configuration',
  'delete policy',
  count(*) = 1,
  'expense-attachments delete policies=' || count(*)
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and cmd = 'DELETE'
  and policyname = 'expense_attachments_delete_v351';

select role_name, operation, passed, detail
from v351_storage_rls_results
order by role_name, operation;

rollback;
