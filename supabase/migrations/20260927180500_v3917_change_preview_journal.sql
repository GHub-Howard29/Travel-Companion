-- Travel Companion V3.9.17 change preview summary journal.
-- Stores only category/action/count metadata. No changed field values or before/after payloads.

begin;

create table if not exists public.trip_change_journal (
  id bigint generated always as identity primary key,
  trip_id text not null,
  revision bigint not null,
  category text not null
    check (category in ('itinerary', 'photo', 'expense', 'checklist', 'settings')),
  action text not null
    check (action in ('added', 'updated', 'deleted', 'changed')),
  item_count integer not null check (item_count > 0),
  source_client_id uuid null,
  occurred_at timestamptz not null default clock_timestamp()
);

create index if not exists trip_change_journal_trip_revision_idx
on public.trip_change_journal (trip_id, revision, occurred_at desc);

create index if not exists trip_change_journal_occurred_at_idx
on public.trip_change_journal (occurred_at);

alter table public.trip_change_journal enable row level security;

revoke all on table public.trip_change_journal from public, anon, authenticated;
grant select on table public.trip_change_journal to authenticated;

drop policy if exists trip_change_journal_select_managers
on public.trip_change_journal;
create policy trip_change_journal_select_managers
on public.trip_change_journal
for select
to authenticated
using (
  public.tc_is_super_admin()
  or public.tc_is_trip_editor(trip_id)
);

create or replace function private.tc_current_app_revision()
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select revision
  from public.app_data_revision
  where singleton = true
$$;

revoke all on function private.tc_current_app_revision()
  from public, anon, authenticated, service_role;

create or replace function private.tc_record_trip_change(
  p_trip_id text,
  p_revision bigint,
  p_category text,
  p_action text,
  p_item_count integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_trip_id is null or p_trip_id = '' or p_item_count <= 0 then
    return;
  end if;

  insert into public.trip_change_journal (
    trip_id,
    revision,
    category,
    action,
    item_count,
    source_client_id
  )
  values (
    p_trip_id,
    p_revision,
    p_category,
    p_action,
    p_item_count,
    private.tc_request_source_client_id()
  );

  delete from public.trip_change_journal
  where occurred_at < clock_timestamp() - interval '90 days';
end;
$$;

revoke all on function private.tc_record_trip_change(text, bigint, text, text, integer)
  from public, anon, authenticated, service_role;

create or replace function private.tc_json_array_added_count(
  p_old_items jsonb,
  p_new_items jsonb
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer
  from jsonb_array_elements(
    case when jsonb_typeof(p_new_items) = 'array' then p_new_items else '[]'::jsonb end
  ) as new_item
  where not exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(p_old_items) = 'array' then p_old_items else '[]'::jsonb end
    ) as old_item
    where old_item ->> 'id' = new_item ->> 'id'
  )
$$;

create or replace function private.tc_json_array_deleted_count(
  p_old_items jsonb,
  p_new_items jsonb
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer
  from jsonb_array_elements(
    case when jsonb_typeof(p_old_items) = 'array' then p_old_items else '[]'::jsonb end
  ) as old_item
  where not exists (
    select 1
    from jsonb_array_elements(
      case when jsonb_typeof(p_new_items) = 'array' then p_new_items else '[]'::jsonb end
    ) as new_item
    where new_item ->> 'id' = old_item ->> 'id'
  )
$$;

create or replace function private.tc_json_array_updated_count(
  p_old_items jsonb,
  p_new_items jsonb
)
returns integer
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer
  from jsonb_array_elements(
    case when jsonb_typeof(p_old_items) = 'array' then p_old_items else '[]'::jsonb end
  ) as old_item
  join jsonb_array_elements(
    case when jsonb_typeof(p_new_items) = 'array' then p_new_items else '[]'::jsonb end
  ) as new_item
    on new_item ->> 'id' = old_item ->> 'id'
  where old_item is distinct from new_item
$$;

revoke all on function private.tc_json_array_added_count(jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.tc_json_array_deleted_count(jsonb, jsonb)
  from public, anon, authenticated, service_role;
revoke all on function private.tc_json_array_updated_count(jsonb, jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.tc_itinerary_items(p_days_data jsonb)
returns table(item_key text, item jsonb)
language sql
immutable
set search_path = ''
as $$
  select
    coalesce(nullif(itinerary_item ->> 'id', ''), day_key || ':' || ordinal_position::text),
    itinerary_item
  from jsonb_each(
    case when jsonb_typeof(p_days_data) = 'object' then p_days_data else '{}'::jsonb end
  ) as day(day_key, day_items)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(day_items) = 'array' then day_items else '[]'::jsonb end
  ) with ordinality as itinerary(itinerary_item, ordinal_position)
$$;

revoke all on function private.tc_itinerary_items(jsonb)
  from public, anon, authenticated, service_role;

create or replace function private.tc_record_trip_master_summary(
  p_old_row jsonb,
  p_new_row jsonb,
  p_revision bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  trip_id text := coalesce(p_new_row ->> 'id', p_old_row ->> 'id');
  itinerary_added integer := 0;
  itinerary_updated integer := 0;
  itinerary_deleted integer := 0;
  photo_added integer := 0;
  photo_updated integer := 0;
  photo_deleted integer := 0;
  settings_count integer := 0;
begin
  with old_items as (
    select * from private.tc_itinerary_items(p_old_row -> 'content' -> 'daysData')
  ),
  new_items as (
    select * from private.tc_itinerary_items(p_new_row -> 'content' -> 'daysData')
  ),
  compared as (
    select
      coalesce(old_items.item_key, new_items.item_key) as item_key,
      old_items.item as old_item,
      new_items.item as new_item
    from old_items
    full join new_items using (item_key)
  )
  select
    count(*) filter (where old_item is null and new_item is not null),
    count(*) filter (where old_item is not null and new_item is null),
    count(*) filter (
      where old_item is not null
        and new_item is not null
        and (old_item - 'coverPhoto') is distinct from (new_item - 'coverPhoto')
    ),
    count(*) filter (
      where old_item -> 'coverPhoto' is null
        and new_item -> 'coverPhoto' is not null
    ),
    count(*) filter (
      where old_item -> 'coverPhoto' is not null
        and new_item -> 'coverPhoto' is null
    ),
    count(*) filter (
      where old_item -> 'coverPhoto' is not null
        and new_item -> 'coverPhoto' is not null
        and old_item -> 'coverPhoto' is distinct from new_item -> 'coverPhoto'
    )
  into
    itinerary_added,
    itinerary_deleted,
    itinerary_updated,
    photo_added,
    photo_deleted,
    photo_updated
  from compared;

  perform private.tc_record_trip_change(trip_id, p_revision, 'itinerary', 'added', itinerary_added);
  perform private.tc_record_trip_change(trip_id, p_revision, 'itinerary', 'updated', itinerary_updated);
  perform private.tc_record_trip_change(trip_id, p_revision, 'itinerary', 'deleted', itinerary_deleted);
  perform private.tc_record_trip_change(trip_id, p_revision, 'photo', 'added', photo_added);
  perform private.tc_record_trip_change(trip_id, p_revision, 'photo', 'updated', photo_updated);
  perform private.tc_record_trip_change(trip_id, p_revision, 'photo', 'deleted', photo_deleted);

  settings_count :=
      (case when p_old_row -> 'title' is distinct from p_new_row -> 'title' then 1 else 0 end)
    + (case when p_old_row -> 'departure_date' is distinct from p_new_row -> 'departure_date' then 1 else 0 end)
    + (case when p_old_row -> 'participants' is distinct from p_new_row -> 'participants' then 1 else 0 end)
    + (case when p_old_row -> 'currency_config' is distinct from p_new_row -> 'currency_config' then 1 else 0 end)
    + (case when p_old_row -> 'sidebar_config' is distinct from p_new_row -> 'sidebar_config' then 1 else 0 end)
    + (case
        when (coalesce(p_old_row -> 'content', '{}'::jsonb)
              - array['daysData', 'checklistData', 'otherInfoItems'])
          is distinct from
             (coalesce(p_new_row -> 'content', '{}'::jsonb)
              - array['daysData', 'checklistData', 'otherInfoItems'])
        then 1 else 0
      end);

  perform private.tc_record_trip_change(trip_id, p_revision, 'settings', 'changed', settings_count);
end;
$$;

revoke all on function private.tc_record_trip_master_summary(jsonb, jsonb, bigint)
  from public, anon, authenticated, service_role;

create or replace function private.tc_record_checklist_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  revision bigint;
  added_count integer;
  updated_count integer;
  deleted_count integer;
begin
  if ((old.content -> 'checklistData') is distinct from (new.content -> 'checklistData')) is false then
    return null;
  end if;

  revision := private.tc_current_app_revision();
  added_count := private.tc_json_array_added_count(
    old.content -> 'checklistData',
    new.content -> 'checklistData'
  );
  updated_count := private.tc_json_array_updated_count(
    old.content -> 'checklistData',
    new.content -> 'checklistData'
  );
  deleted_count := private.tc_json_array_deleted_count(
    old.content -> 'checklistData',
    new.content -> 'checklistData'
  );

  perform private.tc_record_trip_change(new.id, revision, 'checklist', 'added', added_count);
  perform private.tc_record_trip_change(new.id, revision, 'checklist', 'updated', updated_count);
  perform private.tc_record_trip_change(new.id, revision, 'checklist', 'deleted', deleted_count);

  return null;
end;
$$;

revoke all on function private.tc_record_checklist_summary()
  from public, anon, authenticated, service_role;

drop trigger if exists trips_record_checklist_summary on public.trips;
create trigger trips_record_checklist_summary
after update on public.trips
for each row
when ((old.content -> 'checklistData') is distinct from (new.content -> 'checklistData'))
execute function private.tc_record_checklist_summary();

create or replace function private.tc_record_expense_summary()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  revision bigint;
  trip_id text;
begin
  revision := private.tc_current_app_revision();
  trip_id := case when tg_op = 'DELETE' then old.trip_id else new.trip_id end;
  if tg_op = 'INSERT' then
    perform private.tc_record_trip_change(trip_id, revision, 'expense', 'added', 1);
  elsif tg_op = 'DELETE' then
    perform private.tc_record_trip_change(trip_id, revision, 'expense', 'deleted', 1);
  elsif old.deleted_at is null and new.deleted_at is not null then
    perform private.tc_record_trip_change(trip_id, revision, 'expense', 'deleted', 1);
  elsif old.deleted_at is not null and new.deleted_at is null then
    perform private.tc_record_trip_change(trip_id, revision, 'expense', 'added', 1);
  elsif (
    old.title,
    old.amount,
    old.payer,
    old.currency,
    old.expense_date,
    old.attachment_path
  ) is distinct from (
    new.title,
    new.amount,
    new.payer,
    new.currency,
    new.expense_date,
    new.attachment_path
  ) then
    perform private.tc_record_trip_change(trip_id, revision, 'expense', 'updated', 1);
  end if;

  return null;
end;
$$;

revoke all on function private.tc_record_expense_summary()
  from public, anon, authenticated, service_role;

drop trigger if exists expenses_record_change_summary on public.expenses;
create trigger expenses_record_change_summary
after insert or update or delete on public.expenses
for each row
execute function private.tc_record_expense_summary();

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
  affected_trip_id text;
begin
  update public.app_data_revision
  set
    revision = revision + 1,
    updated_at = clock_timestamp(),
    source_client_id = private.tc_request_source_client_id()
  where singleton
  returning * into strict next_revision;

  if tg_table_schema = 'public' and tg_table_name = 'trips' then
    affected_trip_id := case
      when tg_op = 'DELETE' then to_jsonb(old) ->> 'id'
      else to_jsonb(new) ->> 'id'
    end;

    if tg_op = 'UPDATE' then
      perform private.tc_record_trip_master_summary(
        to_jsonb(old),
        to_jsonb(new),
        next_revision.revision
      );
    else
      perform private.tc_record_trip_change(
        affected_trip_id,
        next_revision.revision,
        'settings',
        case when tg_op = 'INSERT' then 'added' else 'deleted' end,
        1
      );
    end if;
  end if;

  if tg_table_schema = 'public'
    and tg_table_name = 'admin_users'
    and tg_op in ('UPDATE', 'DELETE')
  then
    if (to_jsonb(old) ->> 'role') = 'trip_editor' then
      removed_editor_email := lower(to_jsonb(old) ->> 'email');
    end if;
  end if;

  if tg_table_schema = 'public' and tg_table_name = 'admin_users' then
    affected_trip_id := case
      when tg_op = 'DELETE' then to_jsonb(old) ->> 'trip_id'
      else coalesce(to_jsonb(new) ->> 'trip_id', to_jsonb(old) ->> 'trip_id')
    end;
    if affected_trip_id is not null then
      perform private.tc_record_trip_change(
        affected_trip_id,
        next_revision.revision,
        'settings',
        'changed',
        1
      );
    end if;
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

commit;
