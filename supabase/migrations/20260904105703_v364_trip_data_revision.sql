-- Travel Companion V3.6.4 cross-device Trip master-data invalidation.
--
-- The revision row is only an invalidation signal. It intentionally carries no
-- Trip id, email, role, or application content. Clients refetch authoritative
-- rows through their existing RLS policies after receiving the signal.

begin;

create table public.app_data_revision (
  singleton boolean primary key default true,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  source_client_id uuid null,
  constraint app_data_revision_singleton_check check (singleton),
  constraint app_data_revision_nonnegative_check check (revision >= 0)
);

insert into public.app_data_revision (singleton, revision)
values (true, 0);

alter table public.app_data_revision enable row level security;

revoke all on table public.app_data_revision from public, anon, authenticated;
grant select on table public.app_data_revision to authenticated;

create policy app_data_revision_select_managers
on public.app_data_revision
for select
to authenticated
using (
  exists (
    select 1
    from public.admin_users as manager
    where manager.email = coalesce(nullif((select auth.jwt()) ->> 'email', ''), '')
      and manager.role in ('super_admin', 'trip_editor')
  )
);

create or replace function private.tc_request_source_client_id()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  request_headers jsonb;
  raw_client_id text;
begin
  request_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  raw_client_id := nullif(request_headers ->> 'x-travel-companion-client-id', '');
  return raw_client_id::uuid;
exception
  when others then
    return null;
end;
$$;

revoke all on function private.tc_request_source_client_id()
  from public, anon, authenticated, service_role;

create or replace function private.tc_broadcast_trip_data_revision()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_revision public.app_data_revision%rowtype;
  recipient record;
  removed_editor_email text;
begin
  update public.app_data_revision
  set
    revision = revision + 1,
    updated_at = clock_timestamp(),
    source_client_id = private.tc_request_source_client_id()
  where singleton
  returning * into strict next_revision;

  if tg_table_schema = 'public'
    and tg_table_name = 'admin_users'
    and tg_op in ('UPDATE', 'DELETE')
    and old.role = 'trip_editor'
  then
    removed_editor_email := old.email;
  end if;

  for recipient in
    select distinct app_user.id
    from auth.users as app_user
    join public.admin_users as manager
      on manager.email = lower(app_user.email)
    where manager.role in ('super_admin', 'trip_editor')

    union

    select removed_user.id
    from auth.users as removed_user
    where removed_editor_email is not null
      and lower(removed_user.email) = removed_editor_email
  loop
    perform realtime.send(
      jsonb_build_object(
        'revision', next_revision.revision,
        'updated_at', next_revision.updated_at,
        'source_client_id', next_revision.source_client_id
      ),
      'revision_changed',
      'travel-companion:data-revision:' || recipient.id::text,
      true
    );
  end loop;

  return null;
end;
$$;

revoke all on function private.tc_broadcast_trip_data_revision()
  from public, anon, authenticated, service_role;

drop trigger if exists trips_broadcast_data_revision_insert on public.trips;
create trigger trips_broadcast_data_revision_insert
after insert on public.trips
for each row
execute function private.tc_broadcast_trip_data_revision();

drop trigger if exists trips_broadcast_data_revision_update on public.trips;
create trigger trips_broadcast_data_revision_update
after update on public.trips
for each row
when (
  old.title is distinct from new.title
  or old.departure_date is distinct from new.departure_date
  or old.participants is distinct from new.participants
  or old.currency_config is distinct from new.currency_config
  or old.sidebar_config is distinct from new.sidebar_config
  or (old.content - array['checklistData', 'otherInfoItems'])
    is distinct from
    (new.content - array['checklistData', 'otherInfoItems'])
)
execute function private.tc_broadcast_trip_data_revision();

drop trigger if exists trips_broadcast_data_revision_delete on public.trips;
create trigger trips_broadcast_data_revision_delete
after delete on public.trips
for each row
execute function private.tc_broadcast_trip_data_revision();

drop trigger if exists admin_users_broadcast_trip_editor_insert
  on public.admin_users;
create trigger admin_users_broadcast_trip_editor_insert
after insert on public.admin_users
for each row
when (new.role = 'trip_editor')
execute function private.tc_broadcast_trip_data_revision();

drop trigger if exists admin_users_broadcast_trip_editor_update
  on public.admin_users;
create trigger admin_users_broadcast_trip_editor_update
after update on public.admin_users
for each row
when (
  (old.role = 'trip_editor' or new.role = 'trip_editor')
  and (old.email, old.role, old.trip_id)
    is distinct from (new.email, new.role, new.trip_id)
)
execute function private.tc_broadcast_trip_data_revision();

drop trigger if exists admin_users_broadcast_trip_editor_delete
  on public.admin_users;
create trigger admin_users_broadcast_trip_editor_delete
after delete on public.admin_users
for each row
when (old.role = 'trip_editor')
execute function private.tc_broadcast_trip_data_revision();

drop policy if exists app_data_revision_receive_broadcast
  on realtime.messages;
create policy app_data_revision_receive_broadcast
on realtime.messages
for select
to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and realtime.topic() =
    'travel-companion:data-revision:' || (select auth.uid())::text
  and exists (
    select 1
    from public.admin_users as manager
    where manager.email = coalesce(nullif((select auth.jwt()) ->> 'email', ''), '')
      and manager.role in ('super_admin', 'trip_editor')
  )
);

-- No INSERT policy is created on realtime.messages: browser clients receive
-- private broadcasts but cannot publish them.

commit;
