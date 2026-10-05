-- 0013: faster nudges. Idempotent; run after 0012.
--
--  • Cooldown 2 minutes per pair (me → them), at most 10 per pair per rolling 24 h.
--  • Escalation by count, not days: nudges 1–3 polite, 4–6 cheeky, 7+ dramatic. The count
--    restarts once they've settled up: after a nudge they paid back (payments from them to me
--    since that nudge add up to at least its amount), the next nudge starts at 1 again.
--  • Every limit lives in public.nudge_rules() below, the ONE place to change them. send_nudge
--    reads it, and the app reads it too (rpc nudge_rules) for the Nudge button's countdown, so a
--    change here applies everywhere without a deploy. Change it with
--      create or replace function public.nudge_rules() … (copy the function below).

create or replace function public.nudge_rules()
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_build_object(
    'cooldown_seconds', 120, -- one nudge per person (from me to them) every 2 minutes
    'daily_cap', 10,         -- max nudges per person per rolling 24 hours from the same sender
    'polite_until', 3,       -- nudges 1–3 are polite (level 1)
    'cheeky_until', 6        -- nudges 4–6 are cheeky (level 2); 7+ dramatic (level 3)
  );
$$;
revoke execute on function public.nudge_rules() from public, anon;
grant execute on function public.nudge_rules() to authenticated;

-- Nudge someone who owes me. The client sends the amount it shows on the row; the server checks
-- they really owe me at least that (by net balances), applies nudge_rules(), and picks the level.
create or replace function public.send_nudge(p_to_member uuid, p_amount bigint, p_template integer)
returns public.nudges
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rules jsonb := public.nudge_rules();
  v_cooldown interval := make_interval(secs => (v_rules ->> 'cooldown_seconds')::integer);
  v_cap integer := (v_rules ->> 'daily_cap')::integer;
  v_to public.group_members;
  v_group public.groups;
  v_me uuid;
  v_my_net bigint;
  v_their_net bigint;
  v_last timestamptz;
  v_today integer;
  v_wait integer;
  v_streak integer := 0;
  v_n record;
  v_paid bigint;
  v_level integer;
  v_since timestamptz;
  v_days integer;
  v_row public.nudges;
begin
  perform public.require_uid();
  select * into v_to from public.group_members where id = p_to_member and left_at is null;
  if v_to.id is null or not public.is_member(v_to.group_id) then raise exception 'That person isn''t in this group'; end if;
  if v_to.is_ghost then raise exception 'Ghost members can''t be nudged (they don''t have the app yet)'; end if;
  select * into v_group from public.groups where id = v_to.group_id;
  perform public.assert_group_writable(v_group.id);
  if v_group.nudge_mode = 'off' then raise exception 'Nudges are off in this group'; end if;
  v_me := public.my_member_id(v_group.id);
  if v_me = p_to_member then raise exception 'You can''t nudge yourself'; end if;
  if p_template is null or p_template < 0 or p_template > 99 then raise exception 'Bad template'; end if;

  -- One at a time per pair, so two quick taps can't both pass the checks.
  perform pg_advisory_xact_lock(hashtextextended(v_me::text || '>' || p_to_member::text, 0));

  select coalesce(net, 0) into v_my_net from public.group_balances where member_id = v_me;
  select coalesce(net, 0) into v_their_net from public.group_balances where member_id = p_to_member;
  if coalesce(v_their_net, 0) >= 0 or coalesce(v_my_net, 0) <= 0 then raise exception 'They don''t owe you anything right now'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > least(-v_their_net, v_my_net) then raise exception 'That amount doesn''t match what they owe'; end if;

  select max(sent_at), count(*) filter (where sent_at > now() - interval '24 hours')
    into v_last, v_today
  from public.nudges where from_member = v_me and to_member = p_to_member;
  if v_today >= v_cap then
    raise exception 'Daily nudge limit reached' using errcode = 'check_violation';
  end if;
  if v_last is not null and v_last > now() - v_cooldown then
    v_wait := ceil(extract(epoch from (v_last + v_cooldown - now())))::integer;
    raise exception 'You can nudge them again in %:%', v_wait / 60, lpad((v_wait % 60)::text, 2, '0')
      using errcode = 'check_violation';
  end if;

  -- Escalation: nudges since they last settled up (paid back at least a nudge's amount after it).
  for v_n in
    select sent_at, amount from public.nudges
    where from_member = v_me and to_member = p_to_member
    order by sent_at desc limit 500
  loop
    select coalesce(sum(st.amount_base), 0) into v_paid from public.settlements st
    where st.from_member = p_to_member and st.to_member = v_me and st.deleted_at is null
      and st.status <> 'disputed' and st.created_at > v_n.sent_at;
    exit when v_paid >= v_n.amount;
    v_streak := v_streak + 1;
  end loop;
  v_level := case
    when v_group.nudge_mode = 'polite' then 1
    when v_streak + 1 <= (v_rules ->> 'polite_until')::integer then 1
    when v_streak + 1 <= (v_rules ->> 'cheeky_until')::integer then 2
    else 3
  end;

  -- Days it's been owed: since the oldest live expense I paid that they share, after their last
  -- payment to me (whichever is later). Used in the message text only.
  select min(e.created_at) into v_since
  from public.expenses e
  where e.group_id = v_group.id and e.deleted_at is null
    and exists (select 1 from public.expense_payers p where p.expense_id = e.id and p.member_id = v_me)
    and exists (select 1 from public.expense_splits s where s.expense_id = e.id and s.member_id = p_to_member and s.amount_base > 0)
    and e.created_at > coalesce((
      select max(st.created_at) from public.settlements st
      where st.from_member = p_to_member and st.to_member = v_me and st.deleted_at is null and st.status <> 'disputed'
    ), '-infinity'::timestamptz);
  v_days := greatest(0, coalesce(extract(day from now() - v_since)::integer, 0));

  insert into public.nudges (group_id, from_member, to_member, level, amount, days, template)
  values (v_group.id, v_me, p_to_member, v_level, p_amount, v_days, p_template)
  returning * into v_row;

  perform public.log_activity(v_group.id, v_me, 'nudge_sent', v_row.id,
    jsonb_build_object('to_member', p_to_member, 'to_name', v_to.display_name, 'level', v_level, 'amount', p_amount,
                       'base_currency', v_group.base_currency, 'days', v_days, 'template', p_template));
  return v_row;
end;
$$;
revoke execute on function public.send_nudge(uuid, bigint, integer) from public, anon;
grant execute on function public.send_nudge(uuid, bigint, integer) to authenticated;

notify pgrst, 'reload schema';
