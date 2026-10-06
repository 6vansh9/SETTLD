-- 0015: reliable push for nudges (and everything else). Idempotent; run after 0014.
--
--  • nudges.pushed_at: whichever path sends a nudge's push first claims it, so the webhook and the
--    app's direct call (/api/push/nudge, right after the tap) never both send it.
--  • The activity → webhook call (pg_net) waited only 5 s. A cold serverless start plus the push
--    sends can take longer, and Vercel stops a function whose caller has gone, so pushes could be
--    lost while "Send test notification" (a direct call) worked. Now 30 s.
--  • Re-creates the trigger in case it's missing, then prints a health report: read every row of
--    the result panel.

alter table public.nudges add column if not exists pushed_at timestamptz;

create or replace function public.notify_push_on_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if new.kind not in ('expense_created', 'expense_updated', 'expense_deleted', 'settlement_recorded', 'settlement_confirmed',
                      'settlement_disputed', 'comment_added', 'nudge_sent', 'ghost_claimed') then
    return new;
  end if;
  select value into v_url from private.app_settings where key = 'push_webhook_url';
  select value into v_secret from private.app_settings where key = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    raise warning 'push webhook not configured: private.app_settings needs push_webhook_url and push_webhook_secret';
    return new;
  end if;
  begin
    perform net.http_post(
      url := v_url,
      body := jsonb_build_object('type', 'INSERT', 'table', 'activity', 'record', to_jsonb(new)),
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
      timeout_milliseconds := 30000
    );
  exception when others then
    -- Never let a push problem roll back the money write.
    raise warning 'push webhook failed: %', sqlerrm;
  end;
  return new;
end;
$$;
revoke execute on function public.notify_push_on_activity() from public, anon, authenticated;

drop trigger if exists activity_push on public.activity;
create trigger activity_push after insert on public.activity
  for each row execute function public.notify_push_on_activity();

notify pgrst, 'reload schema';

-- Health report (read each row).
select * from (
  select 1 as n, 'pg_net installed' as check,
         case when exists (select 1 from pg_extension where extname = 'pg_net') then 'ok' else 'MISSING: Database › Extensions › enable pg_net' end as result
  union all
  select 2, 'trigger on activity',
         case when exists (select 1 from pg_trigger where tgname = 'activity_push' and tgrelid = 'public.activity'::regclass and tgenabled <> 'D') then 'ok' else 'MISSING' end
  union all
  select 3, 'trigger sends nudges',
         case when (select prosrc from pg_proc where proname = 'notify_push_on_activity' and pronamespace = 'public'::regnamespace) like '%nudge_sent%' then 'ok' else 'NO' end
  union all
  select 4, 'webhook URL',
         coalesce((select case when value ~ '^https://[^/]+/api/push/webhook$' then 'ok: ' || value else 'CHECK: ' || value || ' (expected https://<your site>/api/push/webhook)' end
                   from private.app_settings where key = 'push_webhook_url'),
                  'MISSING: insert push_webhook_url into private.app_settings')
  union all
  select 5, 'webhook secret',
         coalesce((select 'set (' || length(value) || ' characters; must equal PUSH_WEBHOOK_SECRET on Vercel)' from private.app_settings where key = 'push_webhook_secret'),
                  'MISSING: insert push_webhook_secret into private.app_settings')
  union all
  select 6, 'nudges.pushed_at', case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'nudges' and column_name = 'pushed_at') then 'ok' else 'MISSING' end
) report order by n;

-- Recent webhook calls, newest first (status 200 = delivered to the route; 401 = secret mismatch;
-- timed_out / error_msg = the route was too slow or unreachable). Run on its own if you want it:
--   select id, status_code, timed_out, error_msg, left(content::text, 160) as body, created
--   from net._http_response order by created desc limit 10;
