-- 0012: phone and UPI ID become required, the "I don't use UPI" exception, and push for
-- expense edits and deletes. Idempotent; run after 0011.
--
--  • profiles.upi_opt_out: "I don't use UPI (living outside India)". UPI is never offered to pay
--    them. Choosing it clears upi_id; saving a UPI ID clears it.
--  • A saved UPI ID can be changed but not removed (unless opting out), and a saved phone number
--    can be changed but not removed. Existing users without one are asked by the app.
--  • update_expense logs everyone's share before the edit (payload.previous_splits), so the push
--    route can tell people their new share; expense_updated and expense_deleted now push.

------------------------------------------------------------------------------------------------
-- UPI opt-out, and UPI can't be cleared
------------------------------------------------------------------------------------------------

alter table public.profiles add column if not exists upi_opt_out boolean not null default false;

create or replace function public.guard_profile_upi()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.upi_id := nullif(btrim(new.upi_id), ''); -- this trigger fires before profiles_normalize_upi
  if new.upi_opt_out and not coalesce(old.upi_opt_out, false) then
    new.upi_id := null; -- opting out removes the ID
  elsif new.upi_id is not null then
    new.upi_opt_out := false; -- saving an ID means they use UPI
  elsif old.upi_id is not null and not new.upi_opt_out then
    raise exception 'Your UPI ID can be changed but not removed'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
revoke execute on function public.guard_profile_upi() from public, anon, authenticated;

drop trigger if exists profiles_guard_upi on public.profiles;
create trigger profiles_guard_upi
  before update of upi_id, upi_opt_out on public.profiles
  for each row execute function public.guard_profile_upi();

------------------------------------------------------------------------------------------------
-- Phone can be changed, not removed
------------------------------------------------------------------------------------------------

create or replace function public.set_my_phone(p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_phone text := public.valid_phone(p_phone);
begin
  if v_phone is null then
    raise exception 'Enter a valid phone number' using errcode = 'check_violation';
  end if;
  insert into public.user_phones (user_id, phone) values (v_uid, v_phone)
  on conflict (user_id) do update set phone = excluded.phone, updated_at = now();
end;
$$;
revoke execute on function public.set_my_phone(text) from public, anon;
grant execute on function public.set_my_phone(text) to authenticated;

------------------------------------------------------------------------------------------------
-- update_expense: same as 0005, plus previous_splits in the activity payload
------------------------------------------------------------------------------------------------

create or replace function public.update_expense(
  p_expense_id uuid,
  p_title text,
  p_amount bigint,
  p_currency text,
  p_fx_rate numeric,
  p_category text,
  p_date date,
  p_note text,
  p_split_type text,
  p_payers jsonb,
  p_splits jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense public.expenses;
  v_amount_base bigint;
  v_before jsonb;
begin
  perform public.require_uid();
  v_expense := public.expense_for_change(p_expense_id, 'edit');
  if v_expense.deleted_at is not null then raise exception 'This expense was deleted'; end if;
  if char_length(btrim(coalesce(p_title, ''))) = 0 then raise exception 'Give it a name'; end if;
  v_amount_base := public.expense_amount_base(v_expense.group_id, p_amount, p_currency, p_fx_rate);

  update public.expenses
  set title = btrim(p_title), amount = p_amount, currency = p_currency, fx_rate_to_base = p_fx_rate,
      amount_base = v_amount_base, category = coalesce(p_category, 'other'), date = coalesce(p_date, date),
      note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_expense_id;

  -- Everyone's share before the edit, so the push can say "your share is now ₹800" (0012).
  select coalesce(jsonb_object_agg(member_id, amount_base), '{}'::jsonb) into v_before
  from public.expense_splits where expense_id = p_expense_id;

  perform public.write_expense_lines(p_expense_id, v_expense.group_id, v_amount_base, p_split_type, p_payers, p_splits);
  perform public.log_activity(v_expense.group_id, public.my_member_id(v_expense.group_id), 'expense_updated', p_expense_id,
    jsonb_build_object('title', btrim(p_title), 'amount', p_amount, 'currency', p_currency,
                       'amount_base', v_amount_base, 'previous_amount_base', v_expense.amount_base,
                       'previous_splits', v_before));
end;
$$;
revoke execute on function public.update_expense(uuid, text, bigint, text, numeric, text, date, text, text, jsonb, jsonb) from public, anon;
grant execute on function public.update_expense(uuid, text, bigint, text, numeric, text, date, text, text, jsonb, jsonb) to authenticated;

------------------------------------------------------------------------------------------------
-- Push: expense edits and deletes too
------------------------------------------------------------------------------------------------

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
      timeout_milliseconds := 5000
    );
  exception when others then
    -- Never let a push problem roll back the money write.
    raise warning 'push webhook failed: %', sqlerrm;
  end;
  return new;
end;
$$;
revoke execute on function public.notify_push_on_activity() from public, anon, authenticated;

notify pgrst, 'reload schema';
