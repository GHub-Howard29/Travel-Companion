-- Travel Companion V3.9.7 complete application snapshots.
--
-- Daily snapshots intentionally live in the non-exposed private schema. They
-- are a recovery mechanism for application data, not a replacement for
-- Supabase platform backups or Auth/Storage binary backups.

begin;

create table private.application_snapshots (
  id bigint generated always as identity primary key,
  snapshot_kind text not null check (snapshot_kind in ('daily', 'pre_restore')),
  taipei_date date null,
  reason text null,
  created_at timestamptz not null default clock_timestamp(),
  row_counts jsonb not null,
  payload jsonb not null,
  checksum_sha256 text not null check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  constraint application_snapshots_daily_requires_date
    check (
      (snapshot_kind = 'daily' and taipei_date is not null)
      or (snapshot_kind = 'pre_restore' and taipei_date is null)
    )
);

create index application_snapshots_retention_idx
on private.application_snapshots (snapshot_kind, created_at desc);

create unique index application_snapshots_one_daily_per_date_idx
on private.application_snapshots (taipei_date)
where snapshot_kind = 'daily';

revoke all on table private.application_snapshots
  from public, anon, authenticated, service_role;

create or replace function private.tc_application_snapshot_payload()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'format', 'travel-companion-application-snapshot',
    'formatVersion', 1,
    'trips', (select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb) from public.trips as row),
    'other_info_items', (select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb) from public.other_info_items as row),
    'admin_users', (select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb) from public.admin_users as row),
    'admin_profiles', (select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb) from public.admin_profiles as row),
    'checklists', (select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb) from public.checklists as row),
    'checklist_items', (select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb) from public.checklist_items as row),
    'exchange_purchases', (select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb) from public.exchange_purchases as row),
    'expenses', (select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb) from public.expenses as row),
    'trip_deletion_tombstones', (select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb) from public.trip_deletion_tombstones as row),
    'storage_references', (
      select coalesce(jsonb_agg(to_jsonb(row)), '[]'::jsonb)
      from storage.objects as row
      where row.bucket_id in ('expense-attachments', 'itinerary-covers')
    )
  );
$$;

revoke all on function private.tc_application_snapshot_payload()
  from public, anon, authenticated, service_role;

create or replace function private.tc_create_application_snapshot(
  requested_kind text,
  requested_reason text default null
)
returns private.application_snapshots
language plpgsql
security definer
set search_path = ''
as $$
declare
  snapshot_payload jsonb;
  snapshot_counts jsonb;
  snapshot_checksum text;
  snapshot_date date;
  created_snapshot private.application_snapshots;
begin
  if requested_kind not in ('daily', 'pre_restore') then
    raise exception 'Unsupported application snapshot kind: %', requested_kind;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('travel-companion:application-snapshot', 0));
  snapshot_date := case
    when requested_kind = 'daily' then (clock_timestamp() at time zone 'Asia/Taipei')::date
    else null
  end;
  snapshot_payload := private.tc_application_snapshot_payload();
  snapshot_counts := jsonb_build_object(
    'trips', jsonb_array_length(snapshot_payload->'trips'),
    'other_info_items', jsonb_array_length(snapshot_payload->'other_info_items'),
    'admin_users', jsonb_array_length(snapshot_payload->'admin_users'),
    'admin_profiles', jsonb_array_length(snapshot_payload->'admin_profiles'),
    'checklists', jsonb_array_length(snapshot_payload->'checklists'),
    'checklist_items', jsonb_array_length(snapshot_payload->'checklist_items'),
    'exchange_purchases', jsonb_array_length(snapshot_payload->'exchange_purchases'),
    'expenses', jsonb_array_length(snapshot_payload->'expenses'),
    'trip_deletion_tombstones', jsonb_array_length(snapshot_payload->'trip_deletion_tombstones'),
    'storage_references', jsonb_array_length(snapshot_payload->'storage_references')
  );
  snapshot_checksum := encode(extensions.digest(snapshot_payload::text, 'sha256'), 'hex');

  insert into private.application_snapshots (
    snapshot_kind, taipei_date, reason, row_counts, payload, checksum_sha256
  ) values (
    requested_kind, snapshot_date, nullif(btrim(requested_reason), ''),
    snapshot_counts, snapshot_payload, snapshot_checksum
  )
  on conflict (taipei_date) where (snapshot_kind = 'daily')
  do update set
    created_at = excluded.created_at,
    reason = excluded.reason,
    row_counts = excluded.row_counts,
    payload = excluded.payload,
    checksum_sha256 = excluded.checksum_sha256
  returning * into created_snapshot;

  if requested_kind = 'daily' then
    delete from private.application_snapshots as obsolete
    where obsolete.snapshot_kind = 'daily'
      and obsolete.id not in (
        select retained.id
        from private.application_snapshots as retained
        where retained.snapshot_kind = 'daily'
        order by retained.created_at desc, retained.id desc
        limit 7
      );
  end if;

  return created_snapshot;
end;
$$;

revoke all on function private.tc_create_application_snapshot(text, text)
  from public, anon, authenticated, service_role;

-- pg_cron interprets this expression in UTC. Taiwan has no daylight-saving
-- time, so 19:00 UTC is the requested 03:00 Asia/Taipei on the next day.
create extension if not exists pg_cron with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'travel-companion-daily-application-snapshot') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'travel-companion-daily-application-snapshot';
  end if;

  perform cron.schedule(
    'travel-companion-daily-application-snapshot',
    '0 19 * * *',
    $cron$select private.tc_create_application_snapshot('daily', 'scheduled daily snapshot');$cron$
  );
end;
$$;

commit;
