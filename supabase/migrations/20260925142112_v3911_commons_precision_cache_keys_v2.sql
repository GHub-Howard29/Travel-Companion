-- V3.9.11 hotfix follow-up: allow cache records emitted by the deployed
-- commons-precision-v2 Edge Function. Keep v1 accepted for rollback safety.
alter table public.commons_precision_cache
  drop constraint if exists commons_precision_cache_key_check;

alter table public.commons_precision_cache
  add constraint commons_precision_cache_key_check check (
    length(cache_key) between 20 and 300
    and cache_key ~ '^(entity|candidate|no-suitable|lock):commons-precision-v[12]:[A-Za-z0-9:._-]+$'
  );
