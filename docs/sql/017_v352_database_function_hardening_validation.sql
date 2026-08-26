-- Travel Companion V3.5.2 database function hardening validation
--
-- Run after 20260826083326_v352_database_function_hardening.sql.
-- The script is read-only and raises an exception if a security invariant is
-- not met. Product role/data regression remains a separate release check.

do $$
declare
  missing_signature text;
begin
  if exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname like 'tc\_%' escape '\'
      and not coalesce(procedure.proconfig, array[]::text[]) @> array['search_path=""']::text[]
  ) then
    raise exception 'Validation failed: a tc_ function does not use an empty search_path';
  end if;

  if exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    cross join lateral aclexplode(
      coalesce(procedure.proacl, acldefault('f', procedure.proowner))
    ) as privilege
    where namespace.nspname = 'public'
      and procedure.proname like 'tc\_%' escape '\'
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ) then
    raise exception 'Validation failed: a tc_ function is executable by PUBLIC';
  end if;

  if has_schema_privilege('anon', 'public', 'create')
    or has_schema_privilege('authenticated', 'public', 'create')
  then
    raise exception 'Validation failed: an API role can CREATE in public';
  end if;

  if exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname like 'tc\_%' escape '\'
      and procedure.prosecdef
  ) then
    raise exception 'Validation failed: a public tc_ function is SECURITY DEFINER';
  end if;

  if to_regprocedure('private.tc_is_super_admin()') is null
    or to_regprocedure('private.tc_is_trip_editor(text)') is null
  then
    raise exception 'Validation failed: private SECURITY DEFINER helpers are missing';
  end if;

  foreach missing_signature in array array[
    'public.tc_is_super_admin()',
    'public.tc_is_trip_editor(text)',
    'public.tc_can_edit_shared_checklist(text)',
    'public.tc_can_sync_private_checklist(text)',
    'public.tc_other_info_role(text)',
    'public.tc_can_edit_other_info(text)'
  ]
  loop
    if to_regprocedure(missing_signature) is not null
      and not has_function_privilege('anon', missing_signature, 'execute')
    then
      raise exception 'Validation failed: anon cannot execute required RLS helper %', missing_signature;
    end if;

    if to_regprocedure(missing_signature) is not null
      and not has_function_privilege('authenticated', missing_signature, 'execute')
    then
      raise exception 'Validation failed: authenticated cannot execute required RLS helper %', missing_signature;
    end if;
  end loop;

  foreach missing_signature in array array[
    'public.tc_current_email()',
    'public.tc_attachment_storage_scope(text)'
  ]
  loop
    if to_regprocedure(missing_signature) is not null
      and has_function_privilege('anon', missing_signature, 'execute')
    then
      raise exception 'Validation failed: anon can execute authenticated-only helper %', missing_signature;
    end if;

    if to_regprocedure(missing_signature) is not null
      and not has_function_privilege('authenticated', missing_signature, 'execute')
    then
      raise exception 'Validation failed: authenticated cannot execute required helper %', missing_signature;
    end if;
  end loop;

  foreach missing_signature in array array[
    'public.tc_touch_updated_at()',
    'public.tc_prevent_checklist_identity_update()',
    'public.tc_prevent_exchange_purchase_identity_update()',
    'public.tc_prevent_other_info_identity_update()',
    'public.tc_prevent_expense_identity_update()'
  ]
  loop
    if to_regprocedure(missing_signature) is not null
      and (
        has_function_privilege('anon', missing_signature, 'execute')
        or has_function_privilege('authenticated', missing_signature, 'execute')
      )
    then
      raise exception 'Validation failed: API role can execute trigger-only function %', missing_signature;
    end if;
  end loop;
end;
$$;

select
  procedure.oid::regprocedure as function_signature,
  procedure.prosecdef as security_definer,
  procedure.proconfig as function_settings,
  has_function_privilege('anon', procedure.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', procedure.oid, 'execute') as authenticated_execute
from pg_proc as procedure
join pg_namespace as namespace
  on namespace.oid = procedure.pronamespace
where namespace.nspname = 'public'
  and procedure.proname like 'tc\_%' escape '\'
order by procedure.proname, procedure.oid::regprocedure::text;
