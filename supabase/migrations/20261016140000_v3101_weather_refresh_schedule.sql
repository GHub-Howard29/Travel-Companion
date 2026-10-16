-- V3.10.1 scheduled weather refresh. Secrets are provisioned separately before production rollout.
create extension if not exists pg_net;

create or replace function public.tc_weather_dispatch_scheduled_refresh()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_project_url text;
  v_cron_secret text;
  v_request_id bigint;
begin
  select decrypted_secret into v_project_url
  from vault.decrypted_secrets
  where name = 'SUPABASE_URL'
  limit 1;

  select decrypted_secret into v_cron_secret
  from vault.decrypted_secrets
  where name = 'WEATHER_CRON_SECRET'
  limit 1;

  if nullif(btrim(v_project_url), '') is null
    or nullif(btrim(v_cron_secret), '') is null then
    raise exception 'WEATHER_CRON_VAULT_SECRETS_NOT_CONFIGURED';
  end if;

  select net.http_post(
    url := rtrim(v_project_url, '/') || '/functions/v1/weather-forecast',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-weather-cron-secret', v_cron_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  ) into v_request_id;

  return v_request_id;
end;
$$;

revoke all on function public.tc_weather_dispatch_scheduled_refresh() from public, anon, authenticated, service_role;

-- pg_cron runs in UTC. 01/07/13/19 UTC = 09/15/21/03 Asia/Taipei.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'travel-companion-weather-refresh') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'travel-companion-weather-refresh';
  end if;

  perform cron.schedule(
    'travel-companion-weather-refresh',
    '0 1,7,13,19 * * *',
    $cron$select public.tc_weather_dispatch_scheduled_refresh();$cron$
  );
end;
$$;
