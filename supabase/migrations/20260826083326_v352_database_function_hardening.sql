-- Travel Companion V3.5.2 database function and privilege hardening
--
-- Keep the existing role matrix and RLS behavior unchanged while removing
-- implicit function execution and object-creation privileges.

begin;

-- Prevent untrusted API roles from creating objects that could be resolved by
-- privileged code in the exposed public schema.
revoke create on schema public from public, anon, authenticated;

-- Keep SECURITY DEFINER implementations outside the Data API's exposed public
-- schema. API roles only receive USAGE plus the exact helper EXECUTE grants
-- required by RLS evaluation.
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
grant usage on schema private to anon, authenticated;

-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Make future
-- public-schema functions opt-in for the role applying this migration.
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges in schema private
  revoke execute on functions from public, anon, authenticated;

create or replace function private.tc_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where email = coalesce(nullif(auth.jwt() ->> 'email', ''), '')
      and role = 'super_admin'
  );
$$;

create or replace function private.tc_is_trip_editor(target_trip_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.admin_users
    where email = coalesce(nullif(auth.jwt() ->> 'email', ''), '')
      and role = 'trip_editor'
      and trip_id = target_trip_id
  );
$$;

revoke all on function private.tc_is_super_admin()
  from public, anon, authenticated;
revoke all on function private.tc_is_trip_editor(text)
  from public, anon, authenticated;
grant execute on function private.tc_is_super_admin()
  to anon, authenticated;
grant execute on function private.tc_is_trip_editor(text)
  to anon, authenticated;

-- Preserve existing policy/function references without exposing a privileged
-- implementation as a public RPC. These wrappers run with caller privileges;
-- only the private, fixed-search-path lookup bypasses admin_users RLS.
create or replace function public.tc_is_super_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.tc_is_super_admin();
$$;

create or replace function public.tc_is_trip_editor(target_trip_id text)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.tc_is_trip_editor(target_trip_id);
$$;

-- Harden every Travel Companion function, including functions that were
-- originally installed from the pre-migration SQL scripts. An empty
-- search_path is safe because all application relations/functions referenced
-- by these functions are schema-qualified; pg_catalog remains implicitly
-- available.
do $$
declare
  function_record record;
begin
  for function_record in
    select
      namespace.nspname as schema_name,
      procedure.proname as function_name,
      pg_get_function_identity_arguments(procedure.oid) as identity_arguments
    from pg_proc as procedure
    join pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname like 'tc\_%' escape '\'
  loop
    execute format(
      'alter function %I.%I(%s) set search_path = %L',
      function_record.schema_name,
      function_record.function_name,
      function_record.identity_arguments,
      ''
    );

    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated',
      function_record.schema_name,
      function_record.function_name,
      function_record.identity_arguments
    );
  end loop;
end;
$$;

-- RLS helper functions used by guest-readable tables. These expose only role
-- decisions and must remain executable by anon so existing guest reads keep
-- working. authenticated needs the same helpers for its RLS paths.
do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.tc_is_super_admin()',
    'public.tc_is_trip_editor(text)',
    'public.tc_can_edit_shared_checklist(text)',
    'public.tc_can_sync_private_checklist(text)',
    'public.tc_other_info_role(text)',
    'public.tc_can_edit_other_info(text)'
  ]
  loop
    if to_regprocedure(function_signature) is not null then
      execute format(
        'grant execute on function %s to anon, authenticated',
        to_regprocedure(function_signature)
      );
    end if;
  end loop;
end;
$$;

-- Authenticated-only helpers. tc_current_email is referenced by authenticated
-- admin_users RLS, while the attachment scope helper is used by Storage RLS.
do $$
declare
  function_signature text;
begin
  foreach function_signature in array array[
    'public.tc_current_email()',
    'public.tc_attachment_storage_scope(text)'
  ]
  loop
    if to_regprocedure(function_signature) is not null then
      execute format(
        'grant execute on function %s to authenticated',
        to_regprocedure(function_signature)
      );
    end if;
  end loop;
end;
$$;

-- Fail the migration if a Travel Companion function still has an unsafe
-- search_path or retains implicit PUBLIC execution.
do $$
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
    raise exception 'V3.5.2 hardening failed: a tc_ function has an unsafe search_path';
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
    raise exception 'V3.5.2 hardening failed: a tc_ function is executable by PUBLIC';
  end if;

  if has_schema_privilege('anon', 'public', 'create')
    or has_schema_privilege('authenticated', 'public', 'create')
  then
    raise exception 'V3.5.2 hardening failed: an API role can CREATE in public';
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
    raise exception 'V3.5.2 hardening failed: a public tc_ function is SECURITY DEFINER';
  end if;
end;
$$;

commit;
