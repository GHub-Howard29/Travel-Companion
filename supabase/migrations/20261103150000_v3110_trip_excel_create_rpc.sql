-- Travel Companion V3.11.0: atomic Excel Trip creation
--
-- ENVIRONMENT POLICY:
-- Apply this migration to the existing company-local V5 test database as part
-- of implementation. The local V5 database is the intended integration-test
-- target; IM01-IM10 are executed after applying the migration, not prerequisites
-- for applying it. Preserve existing V5 test data; do not reset the database.
-- Never apply this migration to a linked/shared/production database as part of
-- local development. Remote deployment requires a separate release decision.

-- Excel creates a new Trip only. The request registry makes retries of the
-- SAME request_id idempotent; title + departure_date are deliberately not
-- unique and different request IDs always create distinct Trips.

begin;

create table if not exists private.tc_trip_excel_create_requests (
  request_id uuid primary key,
  -- Keep the original owner UUID as an immutable identity marker. Do not
  -- cascade-delete idempotency evidence when the Auth account is removed.
  user_id uuid not null,
  payload_hash text not null,
  trip_id text not null,
  response_payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint tc_trip_excel_create_requests_hash_check
    check (payload_hash ~ '^[0-9a-f]{64}$'),
  constraint tc_trip_excel_create_requests_response_check
    check (jsonb_typeof(response_payload) = 'object')
);

revoke all on table private.tc_trip_excel_create_requests from public, anon, authenticated, service_role;

create or replace function public.tc_get_trip_excel_create_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_existing private.tc_trip_excel_create_requests%rowtype;
begin
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'TC_EXCEL_AUTH_REQUIRED';
  end if;
  if not coalesce(private.tc_is_super_admin(), false) then
    raise exception using errcode = '42501', message = 'TC_EXCEL_SUPER_ADMIN_REQUIRED';
  end if;
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'TC_EXCEL_REQUEST_ID_REQUIRED';
  end if;

  select *
    into v_existing
    from private.tc_trip_excel_create_requests
   where request_id = p_request_id
     and user_id = v_user_id;

  if not found then
    return jsonb_build_object('status', 'NOT_FOUND', 'request_id', p_request_id);
  end if;
  if v_existing.trip_id = 'pending' or v_existing.response_payload = '{}'::jsonb then
    return jsonb_build_object('status', 'PENDING', 'request_id', p_request_id);
  end if;
  if not exists (select 1 from public.trips where id = v_existing.trip_id) then
    return jsonb_build_object(
      'status', 'TRIP_DELETED',
      'request_id', p_request_id,
      'trip_id', v_existing.trip_id
    );
  end if;

  return v_existing.response_payload || jsonb_build_object(
    'status', 'CREATED',
    'request_id', p_request_id,
    'trip_id', v_existing.trip_id,
    'idempotent_replay', true
  );
end;
$$;

revoke all on function public.tc_get_trip_excel_create_request(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.tc_get_trip_excel_create_request(uuid)
  to authenticated;

create or replace function public.tc_create_trip_from_excel(
  p_request_id uuid,
  p_title text,
  p_departure_date date,
  p_cards jsonb,
  p_currency_code text,
  p_currency_symbol text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
  v_title text;
  v_currency_code text;
  v_currency_symbol text;
  v_payload jsonb;
  v_payload_hash text;
  v_existing private.tc_trip_excel_create_requests%rowtype;
  v_reserved boolean := false;
  v_trip_id text;
  v_now timestamptz := clock_timestamp();
  v_participants jsonb;
  v_participant_email_map jsonb;
  v_sidebar jsonb;
  v_days jsonb;
  v_days_data jsonb := '{}'::jsonb;
  v_folders jsonb;
  v_special_info_title text := '領隊導遊聯絡資訊';
  v_special_info_content text := E'領隊：
電話：
導遊：
電話：
集合提醒：';
  v_day_count integer;
  v_card_count integer;
  v_card jsonb;
  v_item jsonb;
  v_day integer;
  v_start text;
  v_end text;
  v_item_title text;
  v_category text;
  v_description text;
  v_type_color text;
  v_cards_by_day jsonb := '{}'::jsonb;
  v_result jsonb;
  v_row record;
begin
  -- Layer 3 authority: do not trust UI state, email cache, or client flags.
  v_user_id := (select auth.uid());
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'TC_EXCEL_AUTH_REQUIRED';
  end if;
  if not coalesce(private.tc_is_super_admin(), false) then
    raise exception using errcode = '42501', message = 'TC_EXCEL_SUPER_ADMIN_REQUIRED';
  end if;

  if p_request_id is null then
    raise exception using errcode = '22023', message = 'TC_EXCEL_REQUEST_ID_REQUIRED';
  end if;
  v_title := btrim(coalesce(p_title, ''));
  if v_title = '' then
    raise exception using errcode = '22023', message = 'TC_EXCEL_TITLE_REQUIRED';
  end if;
  if p_departure_date is null then
    raise exception using errcode = '22023', message = 'TC_EXCEL_DEPARTURE_DATE_REQUIRED';
  end if;
  if jsonb_typeof(p_cards) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'TC_EXCEL_CARDS_MUST_BE_ARRAY';
  end if;
  if jsonb_typeof(p_cards) = 'array'
     and exists (
       select 1
       from jsonb_array_elements(p_cards) as entry(value)
       where jsonb_typeof(entry.value) is distinct from 'object'
     ) then
    raise exception using errcode = '22023', message = 'TC_EXCEL_CARD_MUST_BE_OBJECT';
  end if;

  v_card_count := jsonb_array_length(p_cards);
  if v_card_count < 1 or v_card_count > 1000 then
    raise exception using errcode = '22023', message = 'TC_EXCEL_CARD_COUNT_INVALID';
  end if;

  v_currency_code := upper(btrim(coalesce(p_currency_code, '')));
  v_currency_symbol := btrim(coalesce(p_currency_symbol, ''));
  if v_currency_code = '' or v_currency_symbol = '' then
    raise exception using errcode = '22023', message = 'TC_EXCEL_CURRENCY_CONFIRMATION_REQUIRED';
  end if;

  -- Hash only user-controlled, validated request payload. The generated Trip
  -- UUID is intentionally NOT part of this hash.
  v_payload := jsonb_build_object(
    'title', v_title,
    'departure_date', p_departure_date,
    'cards', p_cards,
    'currency_code', v_currency_code,
    'currency_symbol', v_currency_symbol
  );
  v_payload_hash := encode(extensions.digest(convert_to(v_payload::text, 'UTF8'), 'sha256'), 'hex');

  -- Reserve request_id first. Concurrent retries wait on the PK conflict:
  -- after the first transaction commits, the second reads its stored result;
  -- if the first rolls back, the second may reserve and proceed.
  insert into private.tc_trip_excel_create_requests (
    request_id, user_id, payload_hash, trip_id, response_payload
  )
  values (
    p_request_id, v_user_id, v_payload_hash, 'pending', '{}'::jsonb
  )
  on conflict (request_id) do nothing;

  v_reserved := found;
  if not v_reserved then
    select *
      into v_existing
      from private.tc_trip_excel_create_requests
     where request_id = p_request_id
     for update;

    if not found then
      raise exception using errcode = '40001', message = 'TC_EXCEL_REQUEST_RETRY';
    end if;
    if v_existing.user_id <> v_user_id then
      raise exception using errcode = '42501', message = 'TC_EXCEL_REQUEST_OWNER_MISMATCH';
    end if;
    if v_existing.payload_hash <> v_payload_hash then
      raise exception using errcode = '22023', message = 'TC_EXCEL_REQUEST_PAYLOAD_MISMATCH';
    end if;
    if v_existing.trip_id = 'pending' or v_existing.response_payload = '{}'::jsonb then
      raise exception using errcode = '40001', message = 'TC_EXCEL_REQUEST_INCOMPLETE';
    end if;
    return v_existing.response_payload || jsonb_build_object('idempotent_replay', true);
  end if;

  -- Read the same configured participant profiles as ordinary Trip creation.
  -- admin_users remains the authority for Super Admin membership; profile rows
  -- provide display names, inclusion and ordering.
  select
    coalesce(jsonb_agg(p.display_name order by p.sort_order, lower(p.email)), '[]'::jsonb),
    coalesce(jsonb_object_agg(p.display_name, lower(p.email)), '{}'::jsonb)
  into v_participants, v_participant_email_map
  from public.admin_profiles p
  join public.admin_users au
    on lower(btrim(au.email)) = lower(btrim(p.email))
   and au.role = 'super_admin'
  join auth.users u
    on u.id = p.user_id
   and lower(btrim(u.email)) = lower(btrim(p.email))
  where p.include_in_new_trip = true;

  -- Enforce the ordinary Trip creation invariant at the trust boundary.
  -- The UI also requires at least one participant, but a direct RPC caller
  -- must not be able to create an ownerless Trip.
  if jsonb_array_length(v_participants) = 0 then
    raise exception using errcode = '23514', message = 'TC_EXCEL_DEFAULT_PARTICIPANTS_MISSING';
  end if;

  -- Validate every card again at the trust boundary. Only the fixed V1 keys
  -- are accepted; server-generated ID, typeColor and location are not trusted.
  v_day_count := 0;
  for v_card in select value from jsonb_array_elements(p_cards)
  loop
    if jsonb_typeof(v_card) <> 'object' then
      raise exception using errcode = '22023', message = 'TC_EXCEL_CARD_MUST_BE_OBJECT';
    end if;
    if exists (
      select 1
      from jsonb_object_keys(v_card) as k(key)
      where k.key not in ('day', 'time', 'departureTime', 'title', 'type', 'desc')
    ) then
      raise exception using errcode = '22023', message = 'TC_EXCEL_CARD_HAS_UNSUPPORTED_FIELD';
    end if;
    if not (v_card ?& array['day', 'time', 'title', 'type']) then
      raise exception using errcode = '22023', message = 'TC_EXCEL_CARD_REQUIRED_FIELD_MISSING';
    end if;
    if jsonb_typeof(v_card -> 'time') <> 'string'
       or jsonb_typeof(v_card -> 'title') <> 'string'
       or jsonb_typeof(v_card -> 'type') <> 'string'
       or (v_card ? 'departureTime' and jsonb_typeof(v_card -> 'departureTime') not in ('string', 'null'))
       or (v_card ? 'desc' and jsonb_typeof(v_card -> 'desc') not in ('string', 'null')) then
      raise exception using errcode = '22023', message = 'TC_EXCEL_CARD_FIELD_TYPE_INVALID';
    end if;

    if jsonb_typeof(v_card -> 'day') not in ('number', 'string')
       or (v_card ->> 'day') !~ '^[0-9]{1,2}$' then
      raise exception using errcode = '22023', message = 'TC_EXCEL_DAY_INVALID';
    end if;
    v_day := (v_card ->> 'day')::integer;
    if v_day < 1 or v_day > 30 then
      raise exception using errcode = '22023', message = 'TC_EXCEL_DAY_INVALID';
    end if;

    v_start := coalesce(v_card ->> 'time', '');
    v_end := case
      when not (v_card ? 'departureTime') or jsonb_typeof(v_card -> 'departureTime') = 'null'
        then v_start
      else coalesce(nullif(v_card ->> 'departureTime', ''), v_start)
    end;
    if v_start !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception using errcode = '22023', message = 'TC_EXCEL_START_TIME_INVALID';
    end if;
    if v_end !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]$' or v_end < v_start then
      raise exception using errcode = '22023', message = 'TC_EXCEL_END_TIME_INVALID';
    end if;

    v_item_title := btrim(coalesce(v_card ->> 'title', ''));
    if v_item_title = '' then
      raise exception using errcode = '22023', message = 'TC_EXCEL_CARD_TITLE_REQUIRED';
    end if;
    v_category := coalesce(v_card ->> 'type', '');
    if v_category not in ('交通', '住宿', '景點', '餐飲', '自駕', '其他') then
      raise exception using errcode = '22023', message = 'TC_EXCEL_CATEGORY_INVALID';
    end if;
    if jsonb_typeof(v_card -> 'desc') not in ('string', 'null') and v_card ? 'desc' then
      raise exception using errcode = '22023', message = 'TC_EXCEL_DESCRIPTION_INVALID';
    end if;

    v_day_count := greatest(v_day_count, v_day);
  end loop;

  -- Build a complete 1..max-day structure so missing days remain empty.
  for v_day in 1..v_day_count loop
    v_cards_by_day := jsonb_set(v_cards_by_day, array[v_day::text], '[]'::jsonb, true);
  end loop;

  for v_card in select value from jsonb_array_elements(p_cards)
  loop
    v_day := (v_card ->> 'day')::integer;
    v_start := v_card ->> 'time';
    v_end := case
      when not (v_card ? 'departureTime') or jsonb_typeof(v_card -> 'departureTime') = 'null'
        then v_start
      else coalesce(nullif(v_card ->> 'departureTime', ''), v_start)
    end;
    v_item_title := btrim(v_card ->> 'title');
    v_category := v_card ->> 'type';
    v_description := coalesce(v_card ->> 'desc', '');
    v_type_color := case v_category
      when '交通' then 'bg-emerald-50 text-emerald-700 border-emerald-200'
      when '住宿' then 'bg-amber-50 text-amber-700 border-amber-200'
      when '景點' then 'bg-purple-50 text-purple-700 border-purple-200'
      when '餐飲' then 'bg-blue-50 text-blue-700 border-blue-200'
      when '自駕' then 'bg-orange-50 text-orange-700 border-orange-200'
      else 'bg-slate-50 text-slate-700 border-slate-200'
    end;
    v_item := jsonb_build_object(
      'id', gen_random_uuid()::text,
      'time', v_start,
      'departureTime', v_end,
      'title', v_item_title,
      'type', v_category,
      'typeColor', v_type_color,
      'desc', v_description,
      'location', ''
    );
    v_cards_by_day := jsonb_set(
      v_cards_by_day,
      array[v_day::text],
      (v_cards_by_day -> v_day::text) || jsonb_build_array(v_item),
      true
    );
  end loop;

  select jsonb_agg(day_no order by day_no)
    into v_days
    from generate_series(1, v_day_count) as day_no;

  v_folders := jsonb_build_array(
    jsonb_build_object('id','other-info-attractions','tripId','__TRIP_ID__','parentId',null,'title','景點','order',1,'isSystem',true,'isVisible',true,'createdAt',v_now,'updatedAt',v_now),
    jsonb_build_object('id','other-info-flights','tripId','__TRIP_ID__','parentId',null,'title','機票','order',2,'isSystem',true,'isVisible',true,'createdAt',v_now,'updatedAt',v_now),
    jsonb_build_object('id','other-info-hotels','tripId','__TRIP_ID__','parentId',null,'title','飯店','order',3,'isSystem',true,'isVisible',true,'createdAt',v_now,'updatedAt',v_now),
    jsonb_build_object('id','other-info-transport','tripId','__TRIP_ID__','parentId',null,'title','交通','order',4,'isSystem',true,'isVisible',true,'createdAt',v_now,'updatedAt',v_now),
    jsonb_build_object('id','other-info-tickets','tripId','__TRIP_ID__','parentId',null,'title','票券','order',5,'isSystem',true,'isVisible',true,'createdAt',v_now,'updatedAt',v_now),
    jsonb_build_object('id','other-info-insurance','tripId','__TRIP_ID__','parentId',null,'title','保險','order',6,'isSystem',true,'isVisible',true,'createdAt',v_now,'updatedAt',v_now),
    jsonb_build_object('id','other-info-visa','tripId','__TRIP_ID__','parentId',null,'title','簽證','order',7,'isSystem',true,'isVisible',true,'createdAt',v_now,'updatedAt',v_now),
    jsonb_build_object('id','other-info-food','tripId','__TRIP_ID__','parentId',null,'title','美食','order',8,'isSystem',true,'isVisible',true,'createdAt',v_now,'updatedAt',v_now),
    jsonb_build_object('id','other-info-shopping','tripId','__TRIP_ID__','parentId',null,'title','購物','order',9,'isSystem',true,'isVisible',true,'createdAt',v_now,'updatedAt',v_now),
    jsonb_build_object('id','other-info-other','tripId','__TRIP_ID__','parentId',null,'title','其他','order',99,'isSystem',true,'isVisible',true,'createdAt',v_now,'updatedAt',v_now)
  );

  -- Use the same stable Trip identifier format as the existing app.
  v_trip_id := 'trip-' || gen_random_uuid()::text;
  select jsonb_agg(
    jsonb_set(folder, '{tripId}', to_jsonb(v_trip_id), true)
  )
  into v_folders
  from jsonb_array_elements(v_folders) as folder;

  -- Persist participant emails only in the private V3.9.26+ mapping table.
  -- The Trip JSON returned by the public trips endpoint must never contain them.
  insert into private.trip_participant_email_maps (trip_id, email_map)
  values (v_trip_id, v_participant_email_map);

  if v_day_count < 1 or v_day_count > 30 then
    raise exception using errcode = '22023', message = 'TC_EXCEL_DAY_COUNT_INVALID';
  end if;

  v_days_data := jsonb_build_object('mode', 'guided');
  for v_day in 1..v_day_count loop
    v_days_data := v_days_data || jsonb_build_object(v_day::text, v_cards_by_day -> v_day::text);
  end loop;

  v_sidebar := jsonb_build_array(
    jsonb_build_object('id','itinerary','title','每日詳細行程','type','itinerary'),
    jsonb_build_object('id','checklist','title','共同檢查清單','type','checklist'),
    jsonb_build_object('id','trip_special_info','title','領隊導遊聯絡資訊','type','otherInfo'),
    jsonb_build_object('id','other_info','title','其他資訊','type','otherInfo'),
    jsonb_build_object('id','expense','title','旅費記帳本','type','expense'),
    jsonb_build_object('id','exchange_rate','title','外幣換算','type','exchangeRate')
  );

  -- All durable writes below occur in this single PostgreSQL transaction.
  insert into public.trips (
    id, title, departure_date, is_public, participants, currency_config,
    sidebar_config, content, created_by
  )
  values (
    v_trip_id,
    v_title,
    p_departure_date,
    false,
    v_participants,
    jsonb_build_object('code', v_currency_code, 'symbol', v_currency_symbol),
    v_sidebar,
    jsonb_build_object(
      'mode', 'guided',
      'showLunarDate', true,
      'days', v_days,
      'custom_tab_1', jsonb_build_object('subtitle','旅程備忘錄','mainText',''),
      'checklistData', '[]'::jsonb,
      'otherInfoFolders', v_folders,
      'daysData', v_days_data
    ),
    v_user_id
  );

  insert into public.other_info_items (
    trip_id, client_item_id, folder_id, title, content, allowed_roles,
    sort_order, created_by
  )
  values (
    v_trip_id,
    v_trip_id || '-guided-special-info',
    'special-info-guided',
    v_special_info_title,
    v_special_info_content,
    null,
    1,
    v_user_id
  );

  v_result := jsonb_build_object(
    'trip_id', v_trip_id,
    'title', v_title,
    'departure_date', p_departure_date,
    'day_count', v_day_count,
    'card_count', v_card_count,
    'created_at', v_now
  );

  update private.tc_trip_excel_create_requests
     set trip_id = v_trip_id,
         response_payload = v_result
   where request_id = p_request_id;

  return v_result || jsonb_build_object('idempotent_replay', false);
end;
$$;

revoke all on function public.tc_create_trip_from_excel(uuid, text, date, jsonb, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.tc_create_trip_from_excel(uuid, text, date, jsonb, text, text)
  to authenticated;

commit;
