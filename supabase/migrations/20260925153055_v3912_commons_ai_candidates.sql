create table public.commons_ai_candidate_usage_daily (
  usage_date date primary key,
  request_count integer not null default 0 check (request_count >= 0 and request_count <= 100),
  updated_at timestamptz not null default now()
);

alter table public.commons_ai_candidate_usage_daily enable row level security;
revoke all on table public.commons_ai_candidate_usage_daily from public, anon, authenticated;
grant select, insert, update on table public.commons_ai_candidate_usage_daily to service_role;

create or replace function public.tc_claim_commons_ai_candidate_slot(
  maximum_per_day integer default 100
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  claimed boolean := false;
  today date := timezone('Asia/Taipei', now())::date;
begin
  if maximum_per_day < 1 or maximum_per_day > 100 then return false; end if;
  insert into public.commons_ai_candidate_usage_daily (usage_date, request_count)
  values (today, 1)
  on conflict (usage_date) do update
    set request_count = public.commons_ai_candidate_usage_daily.request_count + 1,
        updated_at = now()
    where public.commons_ai_candidate_usage_daily.request_count < maximum_per_day
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

revoke all on function public.tc_claim_commons_ai_candidate_slot(integer) from public, anon, authenticated;
grant execute on function public.tc_claim_commons_ai_candidate_slot(integer) to service_role;
