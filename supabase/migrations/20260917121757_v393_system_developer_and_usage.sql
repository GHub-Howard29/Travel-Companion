-- Travel Companion V3.9.3 system-developer capability and aggregate usage
--
-- Privileged implementations stay in the non-exposed private schema. Public
-- RPC wrappers remain SECURITY INVOKER and receive explicit authenticated-only
-- EXECUTE grants.

begin;

create schema if not exists private;

create table private.system_developers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint system_developers_email_normalized_check
    check (email = lower(btrim(email)) and email <> '')
);

create unique index system_developers_one_active_idx
  on private.system_developers ((is_active))
  where is_active;

alter table private.system_developers enable row level security;
revoke all on table private.system_developers from public, anon, authenticated;

create table private.user_usage_summaries (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  first_used_at timestamptz not null,
  last_used_at timestamptz not null,
  valid_session_count bigint not null default 1,
  last_session_started_at timestamptz not null,
  constraint user_usage_summaries_email_normalized_check
    check (email = lower(btrim(email)) and email <> ''),
  constraint user_usage_summaries_valid_session_count_check
    check (valid_session_count >= 1),
  constraint user_usage_summaries_time_order_check
    check (first_used_at <= last_used_at and last_session_started_at <= last_used_at)
);

create index user_usage_summaries_last_used_at_idx
  on private.user_usage_summaries (last_used_at desc);

alter table private.user_usage_summaries enable row level security;
revoke all on table private.user_usage_summaries from public, anon, authenticated;

insert into private.system_developers (user_id, email)
select auth_user.id, lower(btrim(auth_user.email))
from auth.users as auth_user
where lower(btrim(auth_user.email)) = 'haw1971@gmail.com'
on conflict (user_id) do update
set email = excluded.email,
    is_active = true,
    updated_at = now();

create or replace function private.tc_is_system_developer_core()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from private.system_developers as developer
      where developer.user_id = (select auth.uid())
        and developer.email = lower(
          btrim(coalesce(nullif(auth.jwt() ->> 'email', ''), ''))
        )
        and developer.is_active
    );
$$;

create or replace function private.tc_record_usage_session_core()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  caller_user_id uuid := auth.uid();
  caller_email text := lower(
    btrim(coalesce(nullif(auth.jwt() ->> 'email', ''), ''))
  );
  observed_at timestamptz := clock_timestamp();
  previous_session_started_at timestamptz;
  next_summary private.user_usage_summaries%rowtype;
begin
  if caller_user_id is null or caller_email = '' then
    raise exception using
      errcode = '42501',
      message = 'Authenticated user with a verified email is required';
  end if;

  select summary.last_session_started_at
  into previous_session_started_at
  from private.user_usage_summaries as summary
  where summary.user_id = caller_user_id;

  insert into private.user_usage_summaries (
    user_id,
    email,
    first_used_at,
    last_used_at,
    valid_session_count,
    last_session_started_at
  ) values (
    caller_user_id,
    caller_email,
    observed_at,
    observed_at,
    1,
    observed_at
  )
  on conflict (user_id) do update
  set email = excluded.email,
      last_used_at = excluded.last_used_at,
      valid_session_count =
        private.user_usage_summaries.valid_session_count
        + case
            when private.user_usage_summaries.last_session_started_at
              <= excluded.last_used_at - interval '30 minutes'
            then 1
            else 0
          end,
      last_session_started_at =
        case
          when private.user_usage_summaries.last_session_started_at
            <= excluded.last_used_at - interval '30 minutes'
          then excluded.last_session_started_at
          else private.user_usage_summaries.last_session_started_at
        end
  returning * into next_summary;

  return jsonb_build_object(
    'counted_new_session',
      previous_session_started_at is null
      or previous_session_started_at <= observed_at - interval '30 minutes',
    'valid_session_count', next_summary.valid_session_count,
    'last_used_at', next_summary.last_used_at
  );
end;
$$;

create or replace function private.tc_get_usage_summary_core()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not private.tc_is_system_developer_core() then
    raise exception using
      errcode = '42501',
      message = 'System developer capability is required';
  end if;

  select jsonb_build_object(
    'total_users', (select count(*) from auth.users),
    'tracked_users', (select count(*) from private.user_usage_summaries),
    'system_developer_email', (
      select developer.email
      from private.system_developers as developer
      where developer.is_active
      limit 1
    ),
    'checked_at', now(),
    'users', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'email', summary.email,
          'first_used_at', summary.first_used_at,
          'last_used_at', summary.last_used_at,
          'valid_session_count', summary.valid_session_count
        )
        order by summary.last_used_at desc, summary.email
      )
      from private.user_usage_summaries as summary
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

create or replace function public.tc_is_system_developer()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select private.tc_is_system_developer_core();
$$;

create or replace function public.tc_record_usage_session()
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select private.tc_record_usage_session_core();
$$;

create or replace function public.tc_get_usage_summary()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.tc_get_usage_summary_core();
$$;

revoke all on function private.tc_is_system_developer_core()
  from public, anon, authenticated;
revoke all on function private.tc_record_usage_session_core()
  from public, anon, authenticated;
revoke all on function private.tc_get_usage_summary_core()
  from public, anon, authenticated;

revoke all on function public.tc_is_system_developer()
  from public, anon, authenticated;
revoke all on function public.tc_record_usage_session()
  from public, anon, authenticated;
revoke all on function public.tc_get_usage_summary()
  from public, anon, authenticated;

grant usage on schema private to authenticated;
grant execute on function private.tc_is_system_developer_core()
  to authenticated;
grant execute on function private.tc_record_usage_session_core()
  to authenticated;
grant execute on function private.tc_get_usage_summary_core()
  to authenticated;

grant execute on function public.tc_is_system_developer()
  to authenticated;
grant execute on function public.tc_record_usage_session()
  to authenticated;
grant execute on function public.tc_get_usage_summary()
  to authenticated;

comment on table private.system_developers is
  'Single active system-maintenance capability; managed only by controlled SQL migrations.';
comment on table private.user_usage_summaries is
  'Minimal per-user aggregate usage; no page, device, IP, location, or itinerary details.';
comment on function public.tc_record_usage_session() is
  'Records at most one valid session per authenticated user in each 30-minute window.';
comment on function public.tc_get_usage_summary() is
  'Returns aggregate usage only after private system-developer authorization.';

commit;
