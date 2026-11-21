-- ADR-001 S3: authenticated read for the authoritative itinerary CAS version.
begin;

create or replace function public.tc_read_itinerary_version(p_trip_id text)
returns table(version bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_trip_id is null or btrim(p_trip_id) = '' then
    raise exception using errcode = '42501', message = 'ADR001_AUTH_REQUIRED';
  end if;
  perform private.tc_assert_itinerary_edit_permission(p_trip_id, v_user_id);
  return query
    select v.version, v.updated_at
      from public.itinerary_trip_versions v
     where v.trip_id = p_trip_id;
end;
$$;

revoke all on function public.tc_read_itinerary_version(text) from public, anon, authenticated, service_role;
grant execute on function public.tc_read_itinerary_version(text) to authenticated;

commit;
