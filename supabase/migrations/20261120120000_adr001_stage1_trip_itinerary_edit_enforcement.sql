-- ADR-001 Stage 1: Trip-level itinerary edit lease, itinerary version and DB-enforced Save RPC.
-- Local-isolated integration first. This migration preserves unrelated Trip fields and
-- existing visibility, history, revision, and historical-trip triggers.
begin;

-- Do not silently discard an existing card-level lock. Stage 1 is allowed to
-- convert only an empty legacy lease registry.
do $$
begin
  if to_regclass('public.itinerary_card_edit_leases') is null then
    raise exception 'ADR001_STAGE1_LEGACY_LEASE_TABLE_MISSING';
  end if;
  if exists (select 1 from public.itinerary_card_edit_leases) then
    raise exception 'ADR001_STAGE1_LEGACY_CARD_LEASES_NOT_EMPTY';
  end if;
end;
$$;

-- The old card-level lease table is empty. Remove its public RPC entry points
-- before changing its key so two competing lock models cannot remain active.
drop function if exists public.tc_claim_itinerary_card_edit_lease(text, text, uuid);
drop function if exists public.tc_renew_itinerary_card_edit_lease(text, text, uuid);
drop function if exists public.tc_release_itinerary_card_edit_lease(text, text, uuid);
drop function if exists public.tc_list_itinerary_card_edit_leases(text);

-- Keep the existing Realtime publication attached to the renamed Trip-level table.
alter table public.itinerary_card_edit_leases rename to itinerary_trip_edit_leases;

drop index if exists public.itinerary_trip_edit_leases_expiry_idx;
alter table public.itinerary_trip_edit_leases
  drop constraint if exists itinerary_card_edit_leases_card_id_check,
  drop constraint if exists itinerary_card_edit_leases_expiry_check,
  drop constraint if exists itinerary_card_edit_leases_pkey,
  drop column card_id;

alter table public.itinerary_trip_edit_leases
  add constraint itinerary_trip_edit_leases_pkey primary key (trip_id),
  add constraint itinerary_trip_edit_leases_expiry_check check (expires_at > acquired_at);

create index itinerary_trip_edit_leases_expiry_idx
  on public.itinerary_trip_edit_leases (expires_at);

-- An independent itinerary version is deliberately not trips.updated_at:
-- metadata/checklist/other-info writes must not invalidate a card edit.
create table public.itinerary_trip_versions (
  trip_id text primary key references public.trips(id) on delete cascade,
  version bigint not null default 1 check (version > 0),
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.itinerary_trip_versions enable row level security;
revoke all on public.itinerary_trip_versions from public, anon, authenticated, service_role;

insert into public.itinerary_trip_versions (trip_id, version)
select id, 1 from public.trips
on conflict (trip_id) do nothing;

-- Private transaction-bound authorization marker. No client role can read/write it.
create table private.itinerary_save_authorizations (
  transaction_id bigint not null,
  backend_pid integer not null,
  trip_id text not null,
  user_id uuid not null,
  operation_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (transaction_id, backend_pid, trip_id)
);
revoke all on private.itinerary_save_authorizations from public, anon, authenticated, service_role;

create or replace function private.tc_assert_itinerary_edit_permission(
  p_trip_id text,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null or p_user_id is distinct from auth.uid() then
    raise exception using errcode = '42501', message = 'ADR001_AUTH_REQUIRED';
  end if;

  if not exists (select 1 from auth.users u where u.id = p_user_id and u.deleted_at is null) then
    raise exception using errcode = '42501', message = 'ADR001_AUTH_USER_NOT_FOUND';
  end if;

  if not exists (select 1 from public.trips t where t.id = p_trip_id) then
    raise exception using errcode = 'P0002', message = 'ADR001_TRIP_NOT_FOUND';
  end if;

  -- Reuse the exact product authorization sources already used by Trips RLS
  -- and the historical-trip guards; do not create a parallel role definition.
  if not coalesce(
    private.tc_is_super_admin() or private.tc_is_trip_editor(p_trip_id),
    false
  ) then
    raise exception using errcode = '42501', message = 'ADR001_TRIP_EDIT_PERMISSION_REQUIRED';
  end if;

  if not coalesce(private.tc_can_write_shared_trip(p_trip_id), false) then
    raise exception using errcode = '42501', message = 'ADR001_TRIP_WRITE_WINDOW_CLOSED';
  end if;
end;
$$;

-- Trip-level Lease: exactly one active editor/client may hold a Trip at a time.
create or replace function public.tc_claim_itinerary_trip_edit_lease(
  p_trip_id text,
  p_client_id uuid
)
returns table(acquired boolean, owner_user_id uuid, owner_client_id uuid, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_row public.itinerary_trip_edit_leases%rowtype;
begin
  if v_user_id is null or p_trip_id is null or btrim(p_trip_id) = '' or p_client_id is null then
    raise exception using errcode = '22023', message = 'ADR001_INVALID_LEASE_REQUEST';
  end if;
  perform private.tc_assert_itinerary_edit_permission(p_trip_id, v_user_id);

  -- Atomic UPSERT is the Lease-row serialization point; it takes the row lock
  -- before any Trip-row or history advisory lock can be acquired.
  insert into public.itinerary_trip_edit_leases as lease (
    trip_id, owner_user_id, owner_client_id, acquired_at, expires_at
  ) values (
    p_trip_id, v_user_id, p_client_id, v_now, v_now + interval '45 seconds'
  )
  on conflict (trip_id) do update
    set owner_user_id = excluded.owner_user_id,
        owner_client_id = excluded.owner_client_id,
        acquired_at = v_now,
        expires_at = v_now + interval '45 seconds'
    where lease.expires_at <= v_now
       or (lease.owner_user_id = v_user_id and lease.owner_client_id = p_client_id)
  returning * into v_row;

  if found then
    return query select true, v_row.owner_user_id, v_row.owner_client_id, v_row.expires_at;
  else
    select * into v_row from public.itinerary_trip_edit_leases where trip_id = p_trip_id;
    return query select false, v_row.owner_user_id, v_row.owner_client_id, v_row.expires_at;
  end if;
end;
$$;

create or replace function public.tc_renew_itinerary_trip_edit_lease(
  p_trip_id text,
  p_client_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
begin
  if v_user_id is null or p_trip_id is null or p_client_id is null then return false; end if;
  perform private.tc_assert_itinerary_edit_permission(p_trip_id, v_user_id);

  -- Lock the Lease row first and never revive an expired lease.
  perform 1
    from public.itinerary_trip_edit_leases l
   where l.trip_id = p_trip_id
   for update;
  if not found then return false; end if;

  update public.itinerary_trip_edit_leases
     set expires_at = v_now + interval '45 seconds'
   where trip_id = p_trip_id
     and owner_user_id = v_user_id
     and owner_client_id = p_client_id
     and expires_at > v_now;
  return found;
end;
$$;

create or replace function public.tc_release_itinerary_trip_edit_lease(
  p_trip_id text,
  p_client_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_trip_id is null or p_client_id is null then return false; end if;

  -- Serialize release on the same Lease row used by Claim, Renew and Save.
  perform 1
    from public.itinerary_trip_edit_leases l
   where l.trip_id = p_trip_id
   for update;
  if not found then return false; end if;

  delete from public.itinerary_trip_edit_leases
   where trip_id = p_trip_id
     and owner_user_id = v_user_id
     and owner_client_id = p_client_id;
  return found;
end;
$$;

create or replace function public.tc_list_itinerary_trip_edit_leases(p_trip_id text)
returns table(owner_user_id uuid, owner_client_id uuid, expires_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null or p_trip_id is null then
    raise exception using errcode = '42501', message = 'ADR001_AUTH_REQUIRED';
  end if;
  perform private.tc_assert_itinerary_edit_permission(p_trip_id, v_user_id);
  return query
    select l.owner_user_id, l.owner_client_id, l.expires_at
      from public.itinerary_trip_edit_leases l
     where l.trip_id = p_trip_id
       and l.expires_at > clock_timestamp();
end;
$$;

-- Only this SECURITY DEFINER Save RPC can establish the exact transaction-bound
-- authorization record consumed by the trips Trigger below.
create or replace function public.tc_save_itinerary_days(
  p_trip_id text,
  p_client_id uuid,
  p_expected_version bigint,
  p_days_data jsonb,
  p_operation_id uuid
)
returns table(saved boolean, current_version bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_lease public.itinerary_trip_edit_leases%rowtype;
  v_current_version bigint;
  v_new_version bigint;
  v_updated_at timestamptz;
  v_content jsonb;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'ADR001_AUTH_REQUIRED';
  end if;
  if p_trip_id is null or btrim(p_trip_id) = '' or p_client_id is null
     or p_expected_version is null or p_expected_version < 1
     or p_operation_id is null or p_days_data is null
     or jsonb_typeof(p_days_data) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'ADR001_INVALID_SAVE_INPUT';
  end if;

  perform private.tc_assert_itinerary_edit_permission(p_trip_id, v_user_id);

  -- Global lock order: Lease row -> Trip row -> history advisory lock -> Version row.
  -- All competing Lease operations lock the Lease row before touching Trip state.
  select * into v_lease
    from public.itinerary_trip_edit_leases l
   where l.trip_id = p_trip_id
   for update;
  if not found
     or v_lease.owner_user_id is distinct from v_user_id
     or v_lease.owner_client_id is distinct from p_client_id
     or v_lease.expires_at <= v_now then
    raise exception using errcode = '42501', message = 'ADR001_EDIT_LEASE_REQUIRED';
  end if;

  perform 1 from public.trips t where t.id = p_trip_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'ADR001_TRIP_NOT_FOUND'; end if;

  -- Match the existing history trigger's advisory lock after the Trip row lock.
  perform pg_advisory_xact_lock(hashtextextended(p_trip_id, 397));

  select v.version into v_current_version
    from public.itinerary_trip_versions v
   where v.trip_id = p_trip_id
   for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'ADR001_VERSION_BASELINE_MISSING';
  end if;
  if v_current_version <> p_expected_version then
    return query select false, v_current_version, null::timestamptz;
    return;
  end if;

  -- Reject the legacy untrusted direct content write. Preserve all sibling content keys.
  select t.content into v_content from public.trips t where t.id = p_trip_id;
  insert into private.itinerary_save_authorizations (
    transaction_id, backend_pid, trip_id, user_id, operation_id
  ) values (
    txid_current(), pg_backend_pid(), p_trip_id, v_user_id, p_operation_id
  );

  update public.trips
     set content = jsonb_set(coalesce(v_content, '{}'::jsonb), '{daysData}', p_days_data, true)
   where id = p_trip_id;

  -- The AFTER trigger is the single owner of version advancement.
  select v.version into v_new_version
    from public.itinerary_trip_versions v
   where v.trip_id = p_trip_id;

  select t.updated_at into v_updated_at from public.trips t where t.id = p_trip_id;
  return query select true, v_new_version, v_updated_at;
end;
$$;

-- Trigger rejects every direct daysData write that does not carry the marker
-- created within this exact transaction/backend/Trip/user operation.
create or replace function private.tc_guard_itinerary_days_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_marker private.itinerary_save_authorizations%rowtype;
begin
  if old.content -> 'daysData' is not distinct from new.content -> 'daysData' then
    return new;
  end if;

  select a.* into v_marker
    from private.itinerary_save_authorizations a
   where a.transaction_id = txid_current()
     and a.backend_pid = pg_backend_pid()
     and a.trip_id = old.id
     and a.user_id = v_user_id
   for update;

  if not found or v_marker.operation_id is null then
    raise exception using errcode = '42501', message = 'ADR001_DAYS_DATA_SAVE_RPC_REQUIRED';
  end if;

  -- Bind the marker to one write only. Exact cardinality is checked so a
  -- malformed or unexpectedly duplicated marker can never authorize a write.
  delete from private.itinerary_save_authorizations
   where transaction_id = txid_current()
     and backend_pid = pg_backend_pid()
     and trip_id = old.id
     and user_id = v_user_id
     and operation_id = v_marker.operation_id;

  if not found then
    raise exception using errcode = '42501', message = 'ADR001_SAVE_AUTHORIZATION_CONSUME_FAILED';
  end if;

  return new;
end;
$$;

drop trigger if exists trips_guard_itinerary_days_write on public.trips;
create trigger trips_guard_itinerary_days_write
before update of content on public.trips
for each row
execute function private.tc_guard_itinerary_days_write();

-- Itinerary version changes only when daysData actually changes, irrespective
-- of which trusted database writer performed it. The preceding guard ensures
-- only the Save RPC can cause that change.
create or replace function private.tc_bump_itinerary_trip_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.content -> 'daysData' is distinct from new.content -> 'daysData' then
    update public.itinerary_trip_versions
       set version = version + 1,
           updated_at = clock_timestamp()
     where trip_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trips_bump_itinerary_trip_version on public.trips;
create trigger trips_bump_itinerary_trip_version
after update of content on public.trips
for each row
when (old.content -> 'daysData' is distinct from new.content -> 'daysData')
execute function private.tc_bump_itinerary_trip_version();

-- Authenticated callers may use only the specific lease and Save RPC channels.
revoke all on function private.tc_assert_itinerary_edit_permission(text, uuid) from public, anon, authenticated, service_role;
revoke all on function private.tc_guard_itinerary_days_write() from public, anon, authenticated, service_role;
revoke all on function private.tc_bump_itinerary_trip_version() from public, anon, authenticated, service_role;
revoke all on function public.tc_claim_itinerary_trip_edit_lease(text, uuid) from public, anon;
revoke all on function public.tc_renew_itinerary_trip_edit_lease(text, uuid) from public, anon;
revoke all on function public.tc_release_itinerary_trip_edit_lease(text, uuid) from public, anon;
revoke all on function public.tc_list_itinerary_trip_edit_leases(text) from public, anon;
revoke all on function public.tc_save_itinerary_days(text, uuid, bigint, jsonb, uuid) from public, anon, authenticated, service_role;
grant execute on function public.tc_claim_itinerary_trip_edit_lease(text, uuid) to authenticated;
grant execute on function public.tc_renew_itinerary_trip_edit_lease(text, uuid) to authenticated;
grant execute on function public.tc_release_itinerary_trip_edit_lease(text, uuid) to authenticated;
grant execute on function public.tc_list_itinerary_trip_edit_leases(text) to authenticated;
grant execute on function public.tc_save_itinerary_days(text, uuid, bigint, jsonb, uuid) to authenticated;

commit;
