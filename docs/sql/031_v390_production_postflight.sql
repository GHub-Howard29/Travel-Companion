-- V3.9.0 production-safe postflight. Read-only: no fixture or quota writes.
do $$
declare
  policy_count integer;
begin
  if not exists (
    select 1
    from supabase_migrations.schema_migrations
    where version = '20260912093527'
  ) then
    raise exception 'V3.9.0 migration history is missing';
  end if;

  if not exists (
    select 1
    from storage.buckets
    where id = 'itinerary-covers'
      and name = 'itinerary-covers'
      and public
      and file_size_limit = 122880
      and allowed_mime_types = array['image/webp']::text[]
  ) then
    raise exception 'itinerary-covers bucket contract mismatch';
  end if;

  select count(*) into policy_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname in (
      'itinerary_covers_select_v390',
      'itinerary_covers_insert_v390',
      'itinerary_covers_delete_v390'
    )
    and 'authenticated' = any(roles::text[]);

  if policy_count <> 3 then
    raise exception 'Storage policy contract mismatch: %', policy_count;
  end if;

  if not exists (
    select 1
    from pg_class
    where oid = 'public.place_photo_monthly_usage'::regclass
      and relrowsecurity
  ) then
    raise exception 'place photo quota RLS is disabled';
  end if;

  if has_table_privilege('anon', 'public.place_photo_monthly_usage', 'SELECT')
    or has_table_privilege('anon', 'public.place_photo_monthly_usage', 'INSERT')
    or has_table_privilege('anon', 'public.place_photo_monthly_usage', 'UPDATE')
    or has_table_privilege('anon', 'public.place_photo_monthly_usage', 'DELETE')
    or has_table_privilege('authenticated', 'public.place_photo_monthly_usage', 'SELECT')
    or has_table_privilege('authenticated', 'public.place_photo_monthly_usage', 'INSERT')
    or has_table_privilege('authenticated', 'public.place_photo_monthly_usage', 'UPDATE')
    or has_table_privilege('authenticated', 'public.place_photo_monthly_usage', 'DELETE') then
    raise exception 'browser roles can access place photo quota table';
  end if;

  if has_function_privilege(
      'anon',
      'public.tc_claim_place_photo_slots(integer,integer)',
      'EXECUTE'
    )
    or has_function_privilege(
      'authenticated',
      'public.tc_claim_place_photo_slots(integer,integer)',
      'EXECUTE'
    )
    or not has_function_privilege(
      'service_role',
      'public.tc_claim_place_photo_slots(integer,integer)',
      'EXECUTE'
    ) then
    raise exception 'place photo quota RPC grants mismatch';
  end if;

  if not exists (
    select 1
    from pg_proc
    where oid = 'public.tc_claim_place_photo_slots(integer,integer)'::regprocedure
      and prosecdef
      and array_to_string(proconfig, ',') = 'search_path=""'
  ) then
    raise exception 'place photo quota RPC security contract mismatch';
  end if;
end;
$$;
