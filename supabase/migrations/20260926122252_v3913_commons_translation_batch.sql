begin;

create table public.commons_category_translation_cache (
  category_name text not null,
  target_language text not null default 'zh-TW',
  translated_text text not null,
  source text not null check (source in ('wikidata', 'google-nmt')),
  succeeded_at timestamptz not null default now(),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now(),
  primary key (category_name, target_language),
  check (length(category_name) between 1 and 240),
  check (length(translated_text) between 1 and 500)
);

alter table public.commons_category_translation_cache enable row level security;
revoke all on table public.commons_category_translation_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.commons_category_translation_cache to service_role;

create table public.commons_translation_usage_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  translated_items integer not null default 0 check (translated_items >= 0),
  translated_chars integer not null default 0 check (translated_chars >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, window_started_at)
);

alter table public.commons_translation_usage_windows enable row level security;
revoke all on table public.commons_translation_usage_windows from public, anon, authenticated;
grant select, insert, update, delete on table public.commons_translation_usage_windows to service_role;

create or replace function public.tc_claim_commons_translation_slots(
  target_user_id uuid,
  requested_items integer,
  requested_chars integer,
  maximum_items integer default 80,
  maximum_chars integer default 12000
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz := date_trunc('hour', now());
  next_items integer;
  next_chars integer;
begin
  if target_user_id is null or requested_items < 1 or requested_chars < 1
    or maximum_items < 1 or maximum_chars < 1
    or requested_items > maximum_items or requested_chars > maximum_chars then
    return false;
  end if;

  insert into public.commons_translation_usage_windows (
    user_id,
    window_started_at,
    translated_items,
    translated_chars
  )
  values (
    target_user_id,
    current_window,
    requested_items,
    requested_chars
  )
  on conflict (user_id, window_started_at)
  do update set
    translated_items = public.commons_translation_usage_windows.translated_items + excluded.translated_items,
    translated_chars = public.commons_translation_usage_windows.translated_chars + excluded.translated_chars,
    updated_at = now()
  where
    public.commons_translation_usage_windows.translated_items + excluded.translated_items <= maximum_items
    and public.commons_translation_usage_windows.translated_chars + excluded.translated_chars <= maximum_chars
  returning translated_items, translated_chars into next_items, next_chars;

  return next_items is not null and next_chars is not null
    and next_items <= maximum_items and next_chars <= maximum_chars;
end;
$$;

revoke all on function public.tc_claim_commons_translation_slots(uuid, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.tc_claim_commons_translation_slots(uuid, integer, integer, integer, integer)
  to service_role;

create table public.commons_candidate_batch_sessions (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trip_id text not null,
  source_kind text not null check (source_kind in ('broad-search', 'category')),
  source_key text not null,
  raw_cursor jsonb,
  buffered_candidates jsonb not null default '[]'::jsonb,
  seen_file_titles jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (length(token_hash) = 64),
  check (length(trip_id) between 1 and 200),
  check (length(source_key) between 1 and 240),
  check (jsonb_typeof(buffered_candidates) = 'array'),
  check (jsonb_typeof(seen_file_titles) = 'array')
);

create index commons_candidate_batch_sessions_expiry_idx
  on public.commons_candidate_batch_sessions (expires_at);

alter table public.commons_candidate_batch_sessions enable row level security;
revoke all on table public.commons_candidate_batch_sessions from public, anon, authenticated;
grant select, insert, update, delete on table public.commons_candidate_batch_sessions to service_role;

create or replace function public.tc_cleanup_v3913_commons_ephemeral()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  deleted_rows integer := 0;
  affected integer := 0;
begin
  delete from public.commons_candidate_batch_sessions
  where expires_at <= now();
  get diagnostics affected = row_count;
  deleted_rows := deleted_rows + affected;

  delete from public.commons_translation_usage_windows
  where window_started_at < date_trunc('hour', now()) - interval '24 hours';
  get diagnostics affected = row_count;
  deleted_rows := deleted_rows + affected;

  delete from public.commons_category_translation_cache
  where expires_at <= now();
  get diagnostics affected = row_count;
  deleted_rows := deleted_rows + affected;

  return deleted_rows;
end;
$$;

revoke all on function public.tc_cleanup_v3913_commons_ephemeral()
  from public, anon, authenticated;
grant execute on function public.tc_cleanup_v3913_commons_ephemeral()
  to service_role;

commit;
