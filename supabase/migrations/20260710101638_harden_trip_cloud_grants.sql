drop policy if exists "Allow read for everyon" on public.admin_users;

revoke all on public.trips from anon;
revoke all on public.trips from authenticated;
revoke all on public.admin_users from anon;
revoke all on public.admin_users from authenticated;

grant select on public.trips to anon, authenticated;
grant insert, update, delete on public.trips to authenticated;
grant select on public.admin_users to authenticated;
grant insert, update, delete on public.admin_users to authenticated;;
