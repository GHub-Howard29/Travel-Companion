-- Travel Companion V3.9.7: retain unreferenced application files long enough
-- for daily application snapshots to remain useful during recovery.

begin;

create table private.storage_deletion_requests (
  bucket_id text not null check (bucket_id in ('expense-attachments', 'itinerary-covers')),
  object_name text not null,
  requested_at timestamptz not null default clock_timestamp(),
  eligible_at timestamptz not null,
  primary key (bucket_id, object_name)
);

revoke all on table private.storage_deletion_requests
  from public, anon, authenticated, service_role;

create or replace function private.tc_storage_object_trip_id(
  target_bucket_id text,
  target_object_name text
)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select trip.id
  from public.trips as trip
  where target_bucket_id in ('expense-attachments', 'itinerary-covers')
    and target_object_name ~ '^s_[0-9a-f]+/s_[0-9a-f]+/.+$'
    and split_part(target_object_name, '/', 1) = public.tc_attachment_storage_scope(trip.id)
  limit 1;
$$;

revoke all on function private.tc_storage_object_trip_id(text, text)
  from public, anon, authenticated, service_role;

create or replace function public.tc_schedule_storage_deletion(
  target_bucket_id text,
  target_object_name text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_trip_id text;
  scheduled_at timestamptz;
begin
  if (select auth.uid()) is null then
    raise insufficient_privilege using message = 'Authentication is required';
  end if;

  target_trip_id := private.tc_storage_object_trip_id(target_bucket_id, target_object_name);
  if target_trip_id is null or not public.tc_can_write_shared_trip(target_trip_id) then
    raise insufficient_privilege using message = 'Cannot schedule this storage object for deletion';
  end if;

  insert into private.storage_deletion_requests (
    bucket_id, object_name, requested_at, eligible_at
  ) values (
    target_bucket_id, target_object_name, clock_timestamp(), clock_timestamp() + interval '8 days'
  )
  on conflict (bucket_id, object_name) do update
  set requested_at = excluded.requested_at,
      eligible_at = excluded.eligible_at
  returning eligible_at into scheduled_at;

  return scheduled_at;
end;
$$;

revoke all on function public.tc_schedule_storage_deletion(text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.tc_schedule_storage_deletion(text, text) to authenticated;

create or replace function private.tc_storage_object_is_referenced(
  target_bucket_id text,
  target_object_name text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.expenses as expense
    where target_bucket_id = 'expense-attachments'
      and expense.attachment_bucket = target_bucket_id
      and expense.attachment_path = target_object_name
      and expense.deleted_at is null
  )
  or exists (
    select 1
    from public.trips as trip
    where target_bucket_id = 'itinerary-covers'
      and jsonb_path_exists(
        trip.content,
        '$.**.storagePath ? (@ == $path)',
        jsonb_build_object('path', to_jsonb(target_object_name))
      )
  )
  or exists (
    select 1
    from private.application_snapshots as snapshot
    where snapshot.payload -> 'storage_references' @> jsonb_build_array(
      jsonb_build_object('bucket_id', target_bucket_id, 'name', target_object_name)
    )
  );
$$;

revoke all on function private.tc_storage_object_is_referenced(text, text)
  from public, anon, authenticated, service_role;

create or replace function private.tc_purge_due_storage_deletions(
  maximum_rows integer default 250
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_row private.storage_deletion_requests%rowtype;
  removed_count integer := 0;
begin
  if maximum_rows < 1 or maximum_rows > 1000 then
    raise invalid_parameter_value using message = 'maximum_rows must be between 1 and 1000';
  end if;

  for request_row in
    select *
    from private.storage_deletion_requests
    where eligible_at <= clock_timestamp()
    order by eligible_at, bucket_id, object_name
    limit maximum_rows
    for update skip locked
  loop
    if private.tc_storage_object_is_referenced(request_row.bucket_id, request_row.object_name) then
      delete from private.storage_deletion_requests
      where bucket_id = request_row.bucket_id and object_name = request_row.object_name;
    else
      delete from storage.objects
      where bucket_id = request_row.bucket_id and name = request_row.object_name;
      delete from private.storage_deletion_requests
      where bucket_id = request_row.bucket_id and object_name = request_row.object_name;
      removed_count := removed_count + 1;
    end if;
  end loop;

  return removed_count;
end;
$$;

revoke all on function private.tc_purge_due_storage_deletions(integer)
  from public, anon, authenticated, service_role;

drop policy if exists expense_attachments_delete_v351 on storage.objects;
drop policy if exists itinerary_covers_delete_v390 on storage.objects;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'travel-companion-deferred-storage-cleanup') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'travel-companion-deferred-storage-cleanup';
  end if;

  perform cron.schedule(
    'travel-companion-deferred-storage-cleanup',
    '15 19 * * *',
    $cron$select private.tc_purge_due_storage_deletions();$cron$
  );
end;
$$;

commit;
