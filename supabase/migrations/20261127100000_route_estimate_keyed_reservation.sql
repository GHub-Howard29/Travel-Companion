begin;

create table public.route_estimate_reservations (
  cache_key text primary key,
  owner_token uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint route_estimate_reservations_key_length_check check (
    length(cache_key) between 16 and 128
  ),
  constraint route_estimate_reservations_expiry_check check (expires_at > '-infinity'::timestamptz)
);

alter table public.route_estimate_reservations enable row level security;
revoke all on table public.route_estimate_reservations from public, anon, authenticated;
grant select, insert, update, delete on table public.route_estimate_reservations to service_role;

create or replace function public.tc_claim_route_estimate_reservation(
  p_cache_key text,
  p_owner_token uuid,
  p_ttl_seconds integer default 90
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed_key text;
begin
  if p_cache_key is null or length(p_cache_key) not between 16 and 128 then
    raise exception 'cache key is invalid';
  end if;
  if p_owner_token is null then
    raise exception 'owner token is required';
  end if;
  if p_ttl_seconds < 10 or p_ttl_seconds > 300 then
    raise exception 'reservation TTL is outside the allowed range';
  end if;

  insert into public.route_estimate_reservations as reservation (
    cache_key, owner_token, expires_at, created_at, updated_at
  ) values (
    p_cache_key, p_owner_token, now() + make_interval(secs => p_ttl_seconds), now(), now()
  )
  on conflict (cache_key) do update
    set owner_token = excluded.owner_token,
        expires_at = excluded.expires_at,
        updated_at = now()
    where reservation.expires_at <= now()
  returning cache_key into claimed_key;

  return claimed_key is not null;
end;
$$;

create or replace function public.tc_is_route_estimate_reservation_owner(
  p_cache_key text,
  p_owner_token uuid
)
returns boolean
language sql
security invoker
set search_path = ''
as $$
  select exists (
    select 1
      from public.route_estimate_reservations
     where cache_key = p_cache_key
       and owner_token = p_owner_token
       and expires_at > now()
  );
$$;

create or replace function public.tc_store_route_estimate_if_owner(
  p_cache_key text,
  p_owner_token uuid,
  p_trip_id text,
  p_travel_mode text,
  p_origin_key text,
  p_destination_key text,
  p_departure_bucket text,
  p_duration_seconds integer,
  p_distance_meters integer,
  p_transit_daytime_fallback boolean,
  p_transit_vehicle text,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  stored_key text;
begin
  insert into public.route_estimate_cache (
    cache_key, trip_id, travel_mode, origin_key, destination_key, departure_bucket,
    duration_seconds, distance_meters, transit_daytime_fallback, transit_vehicle, expires_at
  )
  select
    p_cache_key, p_trip_id, p_travel_mode, p_origin_key, p_destination_key, p_departure_bucket,
    p_duration_seconds, p_distance_meters, p_transit_daytime_fallback, p_transit_vehicle, p_expires_at
  from public.route_estimate_reservations r
  where r.cache_key = p_cache_key
    and r.owner_token = p_owner_token
    and r.expires_at > clock_timestamp()
  on conflict (cache_key) do update set
    trip_id = excluded.trip_id,
    travel_mode = excluded.travel_mode,
    origin_key = excluded.origin_key,
    destination_key = excluded.destination_key,
    departure_bucket = excluded.departure_bucket,
    duration_seconds = excluded.duration_seconds,
    distance_meters = excluded.distance_meters,
    transit_daytime_fallback = excluded.transit_daytime_fallback,
    transit_vehicle = excluded.transit_vehicle,
    expires_at = excluded.expires_at,
    updated_at = now()
  returning cache_key into stored_key;

  return stored_key is not null;
end;
$$;

create or replace function public.tc_release_route_estimate_reservation(
  p_cache_key text,
  p_owner_token uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  released_key text;
begin
  if p_cache_key is null or length(p_cache_key) not between 16 and 128 then
    raise exception 'cache key is invalid';
  end if;
  if p_owner_token is null then
    raise exception 'owner token is required';
  end if;

  delete from public.route_estimate_reservations
   where cache_key = p_cache_key
     and owner_token = p_owner_token
  returning cache_key into released_key;

  return released_key is not null;
end;
$$;

revoke execute on function public.tc_claim_route_estimate_reservation(text, uuid, integer)
from public, anon, authenticated;
grant execute on function public.tc_claim_route_estimate_reservation(text, uuid, integer)
to service_role;
revoke execute on function public.tc_is_route_estimate_reservation_owner(text, uuid)
from public, anon, authenticated;
grant execute on function public.tc_is_route_estimate_reservation_owner(text, uuid)
to service_role;
revoke execute on function public.tc_store_route_estimate_if_owner(text, uuid, text, text, text, text, text, integer, integer, boolean, text, timestamptz)
from public, anon, authenticated;
grant execute on function public.tc_store_route_estimate_if_owner(text, uuid, text, text, text, text, text, integer, integer, boolean, text, timestamptz)
to service_role;
revoke execute on function public.tc_release_route_estimate_reservation(text, uuid)
from public, anon, authenticated;
grant execute on function public.tc_release_route_estimate_reservation(text, uuid)
to service_role;

commit;
