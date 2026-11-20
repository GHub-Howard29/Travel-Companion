-- ADR-001 Stage 1: create an independent itinerary version baseline for new Trips.
begin;
create or replace function private.tc_initialize_itinerary_trip_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.itinerary_trip_versions(trip_id,version,updated_at)
  values (new.id,1,clock_timestamp())
  on conflict (trip_id) do nothing;
  return new;
end;
$$;
revoke all on function private.tc_initialize_itinerary_trip_version() from public,anon,authenticated,service_role;
drop trigger if exists trips_initialize_itinerary_trip_version on public.trips;
create trigger trips_initialize_itinerary_trip_version
after insert on public.trips
for each row execute function private.tc_initialize_itinerary_trip_version();
commit;
