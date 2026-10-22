-- Minimal synthetic baseline for a clean local Supabase rebuild.
-- The local regression prepare script expands this trip from
-- public/trips/group-tour-2026-10.json and provisions its local-only test user.
-- Never use this seed as a source of production or personal data.

insert into public.trips (
  id,
  title,
  departure_date,
  participants,
  currency_config,
  sidebar_config,
  content
)
values (
  'group-tour-2026-10',
  'Travel-Companion 本機回歸測試旅程',
  date '2026-10-03',
  '[]'::jsonb,
  '{"code":"JPY","symbol":"￥"}'::jsonb,
  '[]'::jsonb,
  '{}'::jsonb
)
on conflict (id) do nothing;
