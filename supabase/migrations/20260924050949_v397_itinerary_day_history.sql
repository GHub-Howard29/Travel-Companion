-- V3.9.7: bounded, private recovery history for itinerary Day contents.

create table private.itinerary_day_history (
  id bigint generated always as identity primary key,
  trip_id text not null references public.trips(id) on delete cascade,
  day integer not null check (day > 0),
  previous_items jsonb not null check (jsonb_typeof(previous_items) = 'array'),
  source_updated_at timestamptz not null,
  actor_user_id uuid,
  source_client_id text check (char_length(source_client_id) <= 128),
  captured_at timestamptz not null default clock_timestamp(),
  bucket_start timestamptz not null,
  constraint itinerary_day_history_hour_unique unique (trip_id, day, bucket_start)
);

create index itinerary_day_history_lookup_idx
on private.itinerary_day_history (trip_id, day, captured_at desc);

revoke all on table private.itinerary_day_history from public, anon, authenticated, service_role;

create or replace function private.tc_capture_itinerary_day_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  day_key text;
  day_number integer;
  old_items jsonb;
  new_items jsonb;
  request_headers jsonb := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  current_bucket timestamptz := date_trunc('hour', clock_timestamp());
begin
  if old.content -> 'daysData' is not distinct from new.content -> 'daysData' then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(old.id, 397));

  for day_key in
    select key from jsonb_object_keys(
      coalesce(old.content -> 'daysData', '{}'::jsonb) ||
      coalesce(new.content -> 'daysData', '{}'::jsonb)
    ) as key
  loop
    if day_key !~ '^[1-9][0-9]*$' then continue; end if;
    day_number := day_key::integer;
    old_items := coalesce(old.content -> 'daysData' -> day_key, '[]'::jsonb);
    new_items := coalesce(new.content -> 'daysData' -> day_key, '[]'::jsonb);
    if old_items is not distinct from new_items then continue; end if;

    insert into private.itinerary_day_history (
      trip_id, day, previous_items, source_updated_at, actor_user_id,
      source_client_id, bucket_start
    ) values (
      old.id, day_number, old_items, old.updated_at, auth.uid(),
      nullif(left(request_headers ->> 'x-travel-companion-client-id', 128), ''),
      current_bucket
    ) on conflict (trip_id, day, bucket_start) do nothing;

    delete from private.itinerary_day_history as history
    where history.trip_id = old.id
      and history.day = day_number
      and history.id not in (
        select retained.id
        from private.itinerary_day_history as retained
        where retained.trip_id = old.id and retained.day = day_number
        order by retained.captured_at desc, retained.id desc
        limit 30
      );
  end loop;

  return new;
end;
$$;

revoke all on function private.tc_capture_itinerary_day_history()
from public, anon, authenticated, service_role;

drop trigger if exists trips_capture_itinerary_day_history on public.trips;
create trigger trips_capture_itinerary_day_history
before update of content on public.trips
for each row
execute function private.tc_capture_itinerary_day_history();
