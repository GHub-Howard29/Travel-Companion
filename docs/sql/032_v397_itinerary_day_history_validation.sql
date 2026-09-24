-- V3.9.7 每日行程版本歷程部署後唯讀驗證。
-- 預期每一列皆為 true；本檔不寫入任何資料。

select to_regclass('private.itinerary_day_history') is not null as history_table_exists;

select exists (
  select 1
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'tc_capture_itinerary_day_history'
    and p.prosecdef
) as history_function_is_security_definer;

select exists (
  select 1
  from pg_trigger
  where tgname = 'trips_capture_itinerary_day_history'
    and not tgisinternal
) as history_trigger_exists;

select not has_table_privilege('authenticated', 'private.itinerary_day_history', 'select')
  and not has_table_privilege('anon', 'private.itinerary_day_history', 'select')
  and not has_table_privilege('service_role', 'private.itinerary_day_history', 'select')
  as browser_roles_cannot_read_history;
