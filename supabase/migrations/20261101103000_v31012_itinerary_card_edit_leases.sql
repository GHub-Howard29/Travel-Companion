begin;

create table public.itinerary_card_edit_leases (
  trip_id text not null references public.trips(id) on delete cascade,
  card_id text not null,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  owner_client_id uuid not null,
  acquired_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  primary key (trip_id, card_id),
  constraint itinerary_card_edit_leases_card_id_check check (length(card_id) between 1 and 128),
  constraint itinerary_card_edit_leases_expiry_check check (expires_at > acquired_at)
);

create index itinerary_card_edit_leases_expiry_idx
  on public.itinerary_card_edit_leases (expires_at);

alter table public.itinerary_card_edit_leases enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'itinerary_card_edit_leases'
  ) then
    alter publication supabase_realtime add table public.itinerary_card_edit_leases;
  end if;
end;
$$;
revoke all on public.itinerary_card_edit_leases from public, anon, authenticated, service_role;

create or replace function public.tc_claim_itinerary_card_edit_lease(
  p_trip_id text,
  p_card_id text,
  p_client_id uuid
)
returns table (
  acquired boolean,
  owner_user_id uuid,
  owner_client_id uuid,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_row public.itinerary_card_edit_leases%rowtype;
begin
  if v_user_id is null or p_trip_id is null or p_client_id is null
    or p_card_id is null or length(p_card_id) not between 1 and 128 then
    raise exception 'invalid_edit_lease_request' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.trips t
    where t.id = p_trip_id
      and exists (
        select 1 from public.admin_users au
        where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and (au.role = 'super_admin' or (au.role = 'trip_editor' and au.trip_id = p_trip_id))
      )
  ) then
    raise exception 'itinerary_edit_permission_required' using errcode = '42501';
  end if;

  insert into public.itinerary_card_edit_leases as lease (
    trip_id, card_id, owner_user_id, owner_client_id, acquired_at, expires_at
  ) values (
    p_trip_id, p_card_id, v_user_id, p_client_id, v_now, v_now + interval '45 seconds'
  )
  on conflict (trip_id, card_id) do update
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
    select * into v_row from public.itinerary_card_edit_leases lease
    where lease.trip_id = p_trip_id and lease.card_id = p_card_id;
    return query select false, v_row.owner_user_id, v_row.owner_client_id, v_row.expires_at;
  end if;
end;
$$;

create or replace function public.tc_renew_itinerary_card_edit_lease(
  p_trip_id text,
  p_card_id text,
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
  if v_user_id is null then return false; end if;
  update public.itinerary_card_edit_leases
  set expires_at = clock_timestamp() + interval '45 seconds'
  where trip_id = p_trip_id and card_id = p_card_id
    and owner_user_id = v_user_id and owner_client_id = p_client_id
    and expires_at > clock_timestamp();
  return found;
end;
$$;

create or replace function public.tc_release_itinerary_card_edit_lease(
  p_trip_id text,
  p_card_id text,
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
  if v_user_id is null then return false; end if;
  delete from public.itinerary_card_edit_leases
  where trip_id = p_trip_id and card_id = p_card_id
    and owner_user_id = v_user_id and owner_client_id = p_client_id;
  return found;
end;
$$;

create or replace function public.tc_list_itinerary_card_edit_leases(p_trip_id text)
returns table (card_id text, owner_user_id uuid, owner_client_id uuid, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select l.card_id, l.owner_user_id, l.owner_client_id, l.expires_at
  from public.itinerary_card_edit_leases l
  where l.trip_id = p_trip_id
    and l.expires_at > clock_timestamp()
    and exists (
      select 1 from public.admin_users au
      where lower(au.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
        and (au.role = 'super_admin' or (au.role = 'trip_editor' and au.trip_id = p_trip_id))
    );
$$;

revoke all on function public.tc_claim_itinerary_card_edit_lease(text, text, uuid) from public, anon;
revoke all on function public.tc_renew_itinerary_card_edit_lease(text, text, uuid) from public, anon;
revoke all on function public.tc_release_itinerary_card_edit_lease(text, text, uuid) from public, anon;
revoke all on function public.tc_list_itinerary_card_edit_leases(text) from public, anon;

grant execute on function public.tc_claim_itinerary_card_edit_lease(text, text, uuid) to authenticated;
grant execute on function public.tc_renew_itinerary_card_edit_lease(text, text, uuid) to authenticated;
grant execute on function public.tc_release_itinerary_card_edit_lease(text, text, uuid) to authenticated;
grant execute on function public.tc_list_itinerary_card_edit_leases(text) to authenticated;

commit;
