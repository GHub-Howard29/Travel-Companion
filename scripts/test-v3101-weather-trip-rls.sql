-- Disposable local-only RLS test for V3.10.1 weather Trip authorization.
-- Run with: npx supabase db query --local --file scripts/test-v3101-weather-trip-rls.sql
begin;

insert into public.admin_users (email, role, trip_id)
values
  ('weather-test-admin@example.invalid', 'super_admin', ''),
  ('weather-test-editor@example.invalid', 'trip_editor', 'weather-test-private')
on conflict (email, role, trip_id) do nothing;

insert into public.trips (id, title, departure_date, content, is_public)
values
  ('weather-test-public', 'Disposable weather RLS public fixture', current_date + 5, '{}'::jsonb, false),
  ('weather-test-private', 'Disposable weather RLS private fixture', current_date + 5, '{}'::jsonb, false)
on conflict (id) do update set
  title = excluded.title, departure_date = excluded.departure_date,
  content = excluded.content, is_public = false;

select set_config('request.jwt.claims', '{"role":"authenticated","email":"weather-test-admin@example.invalid","sub":"00000000-0000-4000-8000-000000000001"}', true);
update public.trips set is_public = true where id = 'weather-test-public';

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
do $$
begin
  if (select count(*) from public.trips where id = 'weather-test-public') <> 1 then
    raise exception 'RLS TEST FAILED: anonymous reader cannot see public Trip';
  end if;
  if (select count(*) from public.trips where id = 'weather-test-private') <> 0 then
    raise exception 'RLS TEST FAILED: anonymous reader can see private Trip';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"role":"authenticated","email":"weather-test-user@example.invalid","sub":"00000000-0000-4000-8000-000000000002"}', true);
do $$
begin
  if (select count(*) from public.trips where id = 'weather-test-public') <> 1 then
    raise exception 'RLS TEST FAILED: ordinary authenticated user cannot see public Trip';
  end if;
  if (select count(*) from public.trips where id = 'weather-test-private') <> 0 then
    raise exception 'RLS TEST FAILED: ordinary authenticated user can see private Trip';
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"role":"authenticated","email":"weather-test-editor@example.invalid","sub":"00000000-0000-4000-8000-000000000003"}', true);
do $$
begin
  if (select count(*) from public.trips where id = 'weather-test-private') <> 1 then
    raise exception 'RLS TEST FAILED: matching trip_editor cannot see assigned private Trip';
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"role":"authenticated","email":"weather-test-admin@example.invalid","sub":"00000000-0000-4000-8000-000000000001"}', true);
do $$
begin
  if (select count(*) from public.trips where id = 'weather-test-private') <> 1 then
    raise exception 'RLS TEST FAILED: super_admin cannot see private Trip';
  end if;
end;
$$;

reset role;
rollback;
