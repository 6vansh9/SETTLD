-- 0014 nudge rules, against a local database that has run the E2E suite (uses its "Goa Trip"
-- group: Riya owes Aman). Everything runs in a transaction that is rolled back.
--   docker exec -i supabase_db_settld psql -U postgres -d postgres < supabase/checks/0014_checks.sql
\set QUIET on
begin;
create temp table r(n serial, what text, ok text);
grant all on r to authenticated; grant all on sequence r_n_seq to authenticated;
select g.id gid, a.id aman, a.user_id aman_uid, b.id riya into temp p
from public.groups g join public.group_members a on a.group_id = g.id and a.display_name = 'Aman'
join public.group_members b on b.group_id = g.id and b.display_name = 'Riya'
where g.name = 'Goa Trip' and g.archived_at is null and g.nudge_mode = 'on'
order by g.created_at desc limit 1;
grant select on p to authenticated;
delete from public.nudges where from_member = (select aman from p);
-- Time travel: push this pair's nudges back (postgres, outside the RPC).
create function pg_temp.back(secs int) returns void language sql as
  $$ update public.nudges set sent_at = sent_at - make_interval(secs => secs) where from_member = (select aman from p) $$;
create function pg_temp.nudge() returns text language plpgsql as $$
declare v public.nudges;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', (select aman_uid from p), 'role', 'authenticated')::text, true);
  v := public.send_nudge((select riya from p), 100, 0);
  reset role;
  return 'level ' || v.level;
exception when others then
  reset role;
  declare d text;
  begin
    get stacked diagnostics d = pg_exception_detail;
    return 'error: ' || sqlerrm || coalesce(' | ' || d, '');
  end;
end $$;

insert into r(what, ok) select 'rules', case when public.nudge_rules() = '{"cooldown_seconds":120,"daily_cap":10,"polite_until":3,"cheeky_until":6}'::jsonb then 'pass' else 'FAIL ' || public.nudge_rules()::text end;
-- 10 nudges: levels 1,1,1,2,2,2,3,3,3,3. Right after the first, a second is refused; after
-- 1 minute still refused; after 2 minutes it succeeds. The 11th in 24 h hits the daily cap.
do $$
declare want int[] := array[1,1,2,2,2,3,3,3,3]; got text; i int;
begin
  for i in 1..9 loop -- with the extra 2-minute nudge at i = 1: 10 nudges, levels 1,1,1,2,2,2,3,3,3,3
    got := pg_temp.nudge();
    insert into r(what, ok) values ('nudge ' || i, case when got = 'level ' || want[i] then 'pass' else 'FAIL ' || got end);
    if i = 1 then
      got := pg_temp.nudge();
      insert into r(what, ok) values ('cooldown: friendly message + retry time in detail',
        case when got ~ '^error: Nudge again in [12]:[0-5][0-9] \| retry_at=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$' then 'pass' else 'FAIL ' || got end);
      -- 1 minute later: still refused.
      perform pg_temp.back(60);
      got := pg_temp.nudge();
      insert into r(what, ok) values ('after 1 minute: still refused', case when got ~ '^error: Nudge again in (0:[0-5][0-9]|1:00) ' then 'pass' else 'FAIL ' || got end);
      -- Just over 2 minutes after the first: the second nudge goes through.
      perform pg_temp.back(61);
      got := pg_temp.nudge();
      insert into r(what, ok) values ('after 2 minutes: second nudge succeeds', case when got = 'level 1' then 'pass' else 'FAIL ' || got end);
    end if;
    perform pg_temp.back(180);
  end loop;
  got := pg_temp.nudge();
  insert into r(what, ok) values ('daily cap: friendly message + retry time', case when got ~ '^error: Daily nudge limit reached · try again tomorrow \| retry_at=[0-9]{4}-' then 'pass' else 'FAIL ' || got end);
  perform pg_temp.back(86400);
  got := pg_temp.nudge();
  insert into r(what, ok) values ('next day, still unpaid → dramatic', case when got = 'level 3' then 'pass' else 'FAIL ' || got end);
  -- Riya pays back at least the last nudge's amount → the count restarts.
  insert into public.settlements (group_id, from_member, to_member, amount, currency, amount_base, method, status)
  select gid, riya, aman, 100, 'INR', 100, 'cash', 'confirmed' from p;
  perform pg_temp.back(180);
  got := pg_temp.nudge();
  insert into r(what, ok) values ('after settling up → polite again', case when got = 'level 1' then 'pass' else 'FAIL ' || got end);
  -- Polite-only groups always send level 1.
  perform pg_temp.back(180); perform pg_temp.nudge(); perform pg_temp.back(180); perform pg_temp.nudge(); perform pg_temp.back(180);
  update public.groups set nudge_mode = 'polite' where id = (select gid from p);
  got := pg_temp.nudge();
  insert into r(what, ok) values ('polite only', case when got = 'level 1' then 'pass' else 'FAIL ' || got end);
end $$;
select n, what, ok from r order by n;
rollback;
