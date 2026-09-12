-- Travel Companion V3.9.0 itinerary cover storage and Google photo quota.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'itinerary-covers',
  'itinerary-covers',
  true,
  122880,
  array['image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        coalesce(qual, '') ilike '%itinerary-covers%'
        or coalesce(with_check, '') ilike '%itinerary-covers%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', policy_record.policyname);
  end loop;
end;
$$;

create policy itinerary_covers_select_v390
on storage.objects
for select
to authenticated
using (
  bucket_id = 'itinerary-covers'
  and array_length(storage.foldername(name), 1) = 2
  and exists (
    select 1
    from public.trips as trip
    where public.tc_attachment_storage_scope(trip.id) = (storage.foldername(name))[1]
      and (select public.tc_can_write_shared_trip(trip.id))
  )
);

create policy itinerary_covers_insert_v390
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'itinerary-covers'
  and array_length(storage.foldername(name), 1) = 2
  and name ~ '^s_[0-9a-f]+/s_[0-9a-f]+/[0-9a-f-]{36}\.webp$'
  and exists (
    select 1
    from public.trips as trip
    where public.tc_attachment_storage_scope(trip.id) = (storage.foldername(name))[1]
      and (select public.tc_can_write_shared_trip(trip.id))
  )
);

create policy itinerary_covers_delete_v390
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'itinerary-covers'
  and array_length(storage.foldername(name), 1) = 2
  and exists (
    select 1
    from public.trips as trip
    where public.tc_attachment_storage_scope(trip.id) = (storage.foldername(name))[1]
      and (select public.tc_can_write_shared_trip(trip.id))
  )
);

create table if not exists public.place_photo_monthly_usage (
  month_start date primary key,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

alter table public.place_photo_monthly_usage enable row level security;
revoke all on table public.place_photo_monthly_usage from public, anon, authenticated;

create or replace function public.tc_claim_place_photo_slots(
  requested_slots integer,
  maximum_requests integer default 1000
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_month date := date_trunc('month', timezone('UTC', now()))::date;
  claimed_count integer;
begin
  if requested_slots < 1 or requested_slots > 5 or maximum_requests < 1 then
    return false;
  end if;

  insert into public.place_photo_monthly_usage (month_start, request_count, updated_at)
  values (current_month, requested_slots, now())
  on conflict (month_start) do update
  set request_count = public.place_photo_monthly_usage.request_count + excluded.request_count,
      updated_at = excluded.updated_at
  where public.place_photo_monthly_usage.request_count + excluded.request_count <= maximum_requests
  returning request_count into claimed_count;

  return claimed_count is not null and claimed_count <= maximum_requests;
end;
$$;

revoke all on function public.tc_claim_place_photo_slots(integer, integer) from public, anon, authenticated;
grant execute on function public.tc_claim_place_photo_slots(integer, integer) to service_role;
