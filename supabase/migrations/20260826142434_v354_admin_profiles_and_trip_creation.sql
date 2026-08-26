-- Travel Companion V3.5.4 administrator display profiles
--
-- Keep authorization in admin_users. This table only supplies stable display
-- names and the participant defaults used when a super admin creates a Trip.

begin;

create table public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  include_in_new_trip boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_profiles_email_format_check check (
    email = lower(btrim(email))
    and position('@' in email) > 1
  ),
  constraint admin_profiles_display_name_check check (
    display_name = btrim(display_name)
    and length(display_name) > 0
  )
);

create unique index admin_profiles_email_lower_key
on public.admin_profiles (lower(email));

create index admin_profiles_new_trip_order_idx
on public.admin_profiles (sort_order, lower(email))
where include_in_new_trip;

drop trigger if exists admin_profiles_touch_updated_at on public.admin_profiles;
create trigger admin_profiles_touch_updated_at
before update on public.admin_profiles
for each row
execute function public.tc_touch_updated_at();

alter table public.admin_profiles enable row level security;

revoke all on table public.admin_profiles from anon, authenticated;
grant select, insert, update, delete on table public.admin_profiles to authenticated;

create policy admin_profiles_select_policy
on public.admin_profiles
for select
to authenticated
using ((select public.tc_is_super_admin()));

create policy admin_profiles_insert_policy
on public.admin_profiles
for insert
to authenticated
with check ((select public.tc_is_super_admin()));

create policy admin_profiles_update_policy
on public.admin_profiles
for update
to authenticated
using ((select public.tc_is_super_admin()))
with check ((select public.tc_is_super_admin()));

create policy admin_profiles_delete_policy
on public.admin_profiles
for delete
to authenticated
using ((select public.tc_is_super_admin()));

-- Initialize one profile per existing Auth-backed super admin. Preserve the
-- established participant names/order; future accounts fall back to Auth data.
with existing_admins as (
  select distinct
    auth_user.id as user_id,
    lower(auth_user.email) as email,
    case lower(auth_user.email)
      when 'haw1971@gmail.com' then 'Howard'
      when 'carol1005@gmail.com' then 'Carol'
      else coalesce(
        nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
        nullif(btrim(auth_user.raw_user_meta_data ->> 'name'), ''),
        split_part(lower(auth_user.email), '@', 1)
      )
    end as display_name,
    case lower(auth_user.email)
      when 'haw1971@gmail.com' then 0
      when 'carol1005@gmail.com' then 1
      else 100
    end as sort_order
  from public.admin_users as admin_user
  join auth.users as auth_user
    on lower(auth_user.email) = lower(admin_user.email)
  where admin_user.role = 'super_admin'
    and auth_user.email is not null
)
insert into public.admin_profiles (
  user_id,
  email,
  display_name,
  include_in_new_trip,
  sort_order
)
select
  user_id,
  email,
  display_name,
  true,
  sort_order
from existing_admins
on conflict (user_id) do nothing;

commit;
