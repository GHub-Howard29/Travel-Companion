-- V3.9.7 完整資料快照部署後唯讀驗證。
-- 每個查詢均應回傳 true；最後一個查詢會顯示每日排程設定。

select to_regclass('private.application_snapshots') is not null as snapshot_table_exists;

select exists (
  select 1 from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname = 'tc_create_application_snapshot'
) as snapshot_function_exists;

select not has_table_privilege('anon', 'private.application_snapshots', 'select')
  and not has_table_privilege('authenticated', 'private.application_snapshots', 'select')
  and not has_table_privilege('service_role', 'private.application_snapshots', 'select')
  as browser_and_service_roles_cannot_read_snapshots;

select exists (
  select 1 from cron.job
  where jobname = 'travel-companion-daily-application-snapshot'
    and schedule = '0 19 * * *'
    and active
) as taipei_daily_snapshot_job_active;

select jobname, schedule, command, active
from cron.job
where jobname = 'travel-companion-daily-application-snapshot';
