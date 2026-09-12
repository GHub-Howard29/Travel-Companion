-- V3.9.0 itinerary cover Storage and photo quota validation.
begin;

do $$
declare
  editor_id uuid := '39039039-0390-4390-8390-390390390390';
  valid_path text := public.tc_attachment_storage_scope('trip-v390') || '/' ||
    public.tc_attachment_storage_scope('item-1') || '/12345678-1234-1234-1234-123456789abc.webp';
  wrong_path text := public.tc_attachment_storage_scope('other-trip') || '/' ||
    public.tc_attachment_storage_scope('item-1') || '/12345678-1234-1234-1234-123456789abc.webp';
  wrong_trip_blocked boolean := false;
  anon_blocked boolean := false;
begin
  if not exists (
    select 1 from storage.buckets
    where id = 'itinerary-covers'
      and public
      and file_size_limit = 122880
      and allowed_mime_types = array['image/webp']::text[]
  ) then
    raise exception 'itinerary-covers bucket contract mismatch';
  end if;

  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', editor_id,
    'email', 'v390-editor@example.invalid'
  )::text, true);
  execute 'set local role authenticated';
  insert into storage.objects (bucket_id, name, owner_id)
  values ('itinerary-covers', valid_path, editor_id::text);
  begin
    insert into storage.objects (bucket_id, name, owner_id)
    values ('itinerary-covers', wrong_path, editor_id::text);
  exception when insufficient_privilege then
    wrong_trip_blocked := true;
  end;
  -- The surrounding transaction rolls this metadata row back. Do not delete it
  -- directly: Supabase Storage requires object deletion through the Storage API.
  execute 'reset role';

  execute 'set local role anon';
  begin
    insert into storage.objects (bucket_id, name)
    values ('itinerary-covers', valid_path);
  exception when insufficient_privilege then
    anon_blocked := true;
  end;
  execute 'reset role';

  if not wrong_trip_blocked or not anon_blocked then
    raise exception 'Storage RLS did not enforce Trip writer boundary';
  end if;
end;
$$;

do $$
declare
  claimed boolean;
  blocked boolean;
begin
  execute 'set local role service_role';
  select public.tc_claim_place_photo_slots(5, 5) into claimed;
  select public.tc_claim_place_photo_slots(1, 5) into blocked;
  execute 'reset role';
  if not claimed or blocked then
    raise exception 'monthly photo quota claim is not atomic';
  end if;
  if has_function_privilege('anon', 'public.tc_claim_place_photo_slots(integer,integer)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.tc_claim_place_photo_slots(integer,integer)', 'EXECUTE') then
    raise exception 'browser roles can execute quota RPC';
  end if;
  if has_table_privilege('anon', 'public.place_photo_monthly_usage', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.place_photo_monthly_usage', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'browser roles can access quota table';
  end if;
end;
$$;

rollback;
