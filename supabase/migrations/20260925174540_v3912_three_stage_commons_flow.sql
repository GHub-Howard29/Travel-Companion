-- V3.9.12 改採使用者主導的三階段 Commons 流程；不再保存 AI／自動精準判斷的快取、鎖與用量資料。
drop function if exists public.tc_claim_commons_ai_candidate_slot(integer);
drop function if exists public.tc_claim_commons_precision_upstream_slot(integer, integer);
drop function if exists public.tc_acquire_commons_precision_upstream_lock(uuid);
drop function if exists public.tc_release_commons_precision_upstream_lock(uuid);
drop function if exists public.tc_put_commons_precision_cache(text, text, jsonb, timestamptz);
drop function if exists public.tc_acquire_commons_precision_cache_lock(text);
drop function if exists public.tc_release_commons_precision_cache_lock(text);
drop function if exists public.tc_add_commons_precision_usage(date, jsonb);

drop table if exists public.commons_ai_candidate_usage_daily;
drop table if exists public.commons_precision_cache;
drop table if exists public.commons_precision_quota_state;
drop table if exists public.commons_precision_upstream_lock;
drop table if exists public.commons_precision_usage_daily;
