-- V3.6.0 route estimate infrastructure validation (read-only).

select
  table_name,
  row_security_active
from (
  select
    c.relname as table_name,
    c.relrowsecurity as row_security_active
  from pg_class as c
  join pg_namespace as n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('route_estimate_cache', 'route_query_daily_usage')
) as validation
order by table_name;

select
  grantee,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('route_estimate_cache', 'route_query_daily_usage')
order by table_name, grantee, privilege_type;

select
  p.proname,
  not p.prosecdef as security_invoker,
  p.proconfig,
  has_function_privilege('anon', p.oid, 'execute') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
  has_function_privilege('service_role', p.oid, 'execute') as service_role_can_execute
from pg_proc as p
join pg_namespace as n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'tc_claim_route_query_slot';

select
  indexname,
  indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'route_estimate_cache'
order by indexname;
