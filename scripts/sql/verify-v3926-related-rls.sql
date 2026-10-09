-- V3.9.26 local-only related-data RLS fixture. All changes roll back.
\set ON_ERROR_STOP on
begin;

insert into public.trips (id, title, departure_date, content, is_public)
values
  ('v3926-related-private', 'Private fixture', current_date, '{}', false),
  ('v3926-related-public', 'Public fixture', current_date, '{}', false);

insert into public.admin_users(id, email, role, trip_id) values
  (99261001, 'v3926-related-editor@example.invalid', 'trip_editor', 'v3926-related-private'),
  (99261002, 'v3926-related-editor@example.invalid', 'trip_editor', 'v3926-related-public'),
  (99261003, 'v3926-related-admin@example.invalid', 'super_admin', '');

select set_config('request.jwt.claims', '{"sub":"33333333-3333-4333-8333-333333333333","email":"v3926-related-admin@example.invalid","role":"authenticated"}', true);
update public.trips set is_public = true where id = 'v3926-related-public';

insert into public.checklists (id, trip_id, scope, owner_user_id, title)
values
  ('11111111-1111-4111-8111-111111111101', 'v3926-related-private', 'shared', null, 'private shared checklist'),
  ('11111111-1111-4111-8111-111111111102', 'v3926-related-public', 'shared', null, 'public shared checklist');

insert into public.checklist_items (id, checklist_id, label)
values
  ('11111111-1111-4111-8111-111111111201', '11111111-1111-4111-8111-111111111101', 'private checklist item'),
  ('11111111-1111-4111-8111-111111111202', '11111111-1111-4111-8111-111111111102', 'public checklist item');

insert into public.other_info_items (id, trip_id, title, content, allowed_roles)
values
  ('11111111-1111-4111-8111-111111111301', 'v3926-related-public', 'Public info', 'visible to all', null),
  ('11111111-1111-4111-8111-111111111302', 'v3926-related-public', 'Editor-only info', 'restricted', array['trip_editor']::text[]),
  ('11111111-1111-4111-8111-111111111303', 'v3926-related-private', 'Private trip info', 'private', null);

set local role anon;
do $$
begin
  if exists (select 1 from public.checklists where trip_id = 'v3926-related-private') then
    raise exception 'Guest can read a private Trip checklist';
  end if;
  if exists (select 1 from public.checklist_items where label = 'private checklist item') then
    raise exception 'Guest can read a private Trip checklist item';
  end if;
  if not exists (select 1 from public.checklists where trip_id = 'v3926-related-public' and title = 'public shared checklist') then
    raise exception 'Guest cannot read a public Trip shared checklist';
  end if;
  if not exists (select 1 from public.checklist_items where label = 'public checklist item') then
    raise exception 'Guest cannot read a public Trip checklist item';
  end if;
  if not exists (select 1 from public.other_info_items where title = 'Public info') then
    raise exception 'Guest cannot read public Other Info';
  end if;
  if exists (select 1 from public.other_info_items where title = 'Editor-only info') then
    raise exception 'Guest can read role-restricted Other Info';
  end if;
  if exists (select 1 from public.other_info_items where title = 'Private trip info') then
    raise exception 'Guest can read Other Info for a private Trip';
  end if;
end $$;
\echo PASS guest: public shared checklist/items visible; private Trip checklist/items and restricted Other Info hidden.

reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","email":"v3926-related-user@example.invalid","role":"authenticated"}', true);
do $$
begin
  if exists (select 1 from public.checklists where trip_id = 'v3926-related-private') then
    raise exception 'Ordinary user can read a private Trip checklist';
  end if;
  if exists (select 1 from public.other_info_items where title = 'Editor-only info') then
    raise exception 'Ordinary user can read role-restricted Other Info';
  end if;
end $$;
\echo PASS ordinary user: private Trip checklist and editor-only Other Info hidden.

select set_config('request.jwt.claims', '{"sub":"22222222-2222-4222-8222-222222222222","email":"v3926-related-editor@example.invalid","role":"authenticated"}', true);
do $$
begin
  if not exists (select 1 from public.trips where id = 'v3926-related-private') then
    raise exception 'Invited editor cannot read private Trip';
  end if;
  if not exists (select 1 from public.checklists where trip_id = 'v3926-related-private') then
    raise exception 'Invited editor cannot read shared checklist for private Trip';
  end if;
  if not exists (select 1 from public.other_info_items where title = 'Editor-only info') then
    raise exception 'Invited editor cannot read allowed-role Other Info';
  end if;
end $$;
\echo PASS invited editor: private Trip shared checklist and permitted Other Info visible.

reset role;
rollback;
\echo V3.9.26 related-data RLS fixture completed and rolled back.
