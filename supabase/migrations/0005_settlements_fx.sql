-- Milestone 5: settle up + currencies (PRD.md › Settle up, Currencies, Data model)
-- Requires 0001–0004. Decisions (user-approved):
--   • Settlements are always in the group's base currency.
--   • A settlement counts toward balances as soon as it's recorded; a disputed one stops counting
--     until whoever recorded it edits (back to pending) or deletes it.
--   • Either side can record. Recorded by the receiver = confirmed immediately. Only the person
--     who recorded a settlement can edit/delete/restore it (for payer-recorded ones: the payer).
--   • Settlements and expenses touching a member who has left are locked (their balance stays 0).

------------------------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------------------------

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  from_member uuid not null references public.group_members (id),
  to_member uuid not null references public.group_members (id),
  amount bigint not null check (amount > 0),
  currency text not null check (currency in ('INR', 'USD', 'AUD', 'EUR', 'GBP')),
  amount_base bigint not null check (amount_base > 0),
  method text not null check (method in ('upi', 'cash', 'other')),
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'disputed')),
  client_id uuid unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint settlements_not_to_self check (from_member <> to_member)
);

create index settlements_group_created_idx on public.settlements (group_id, created_at desc);
create index settlements_from_idx on public.settlements (from_member);
create index settlements_to_idx on public.settlements (to_member);

create trigger settlements_set_updated_at
  before update on public.settlements
  for each row execute function public.set_updated_at();

-- FX cache (PRD: 6 h). Written only by the server with the service-role key; readable by users.
create table public.fx_rates (
  base text not null check (base in ('INR', 'USD', 'AUD', 'EUR', 'GBP')),
  quote text not null check (quote in ('INR', 'USD', 'AUD', 'EUR', 'GBP')),
  rate numeric(20, 10) not null check (rate > 0),
  fetched_at timestamptz not null default now(),
  primary key (base, quote)
);

------------------------------------------------------------------------------------------------
-- Balances now include settlements: sent adds, received subtracts, disputed/deleted excluded.
------------------------------------------------------------------------------------------------

create or replace view public.group_balances
with (security_invoker = true)
as
select
  m.group_id,
  m.id as member_id,
  coalesce(p.paid, 0)::bigint as paid,
  coalesce(s.owed, 0)::bigint as owed,
  coalesce(ss.sent, 0)::bigint as settlements_sent,
  coalesce(sr.received, 0)::bigint as settlements_received,
  (coalesce(p.paid, 0) - coalesce(s.owed, 0) + coalesce(ss.sent, 0) - coalesce(sr.received, 0))::bigint as net
from public.group_members m
left join (
  select ep.member_id, sum(ep.amount_base) as paid
  from public.expense_payers ep
  join public.expenses e on e.id = ep.expense_id
  where e.deleted_at is null
  group by ep.member_id
) p on p.member_id = m.id
left join (
  select es.member_id, sum(es.amount_base) as owed
  from public.expense_splits es
  join public.expenses e on e.id = es.expense_id
  where e.deleted_at is null
  group by es.member_id
) s on s.member_id = m.id
left join (
  select from_member as member_id, sum(amount_base) as sent
  from public.settlements
  where deleted_at is null and status <> 'disputed'
  group by from_member
) ss on ss.member_id = m.id
left join (
  select to_member as member_id, sum(amount_base) as received
  from public.settlements
  where deleted_at is null and status <> 'disputed'
  group by to_member
) sr on sr.member_id = m.id;

------------------------------------------------------------------------------------------------
-- Row-level security
------------------------------------------------------------------------------------------------

alter table public.settlements enable row level security;
alter table public.fx_rates enable row level security;

create policy "Members can read settlements"
  on public.settlements for select to authenticated
  using (public.is_member(group_id));

create policy "Signed-in users can read cached rates"
  on public.fx_rates for select to authenticated
  using (true);

-- No write policies: settlements change only through the RPCs below; fx_rates only via the
-- service role (which bypasses RLS).

------------------------------------------------------------------------------------------------
-- Settlement RPCs
------------------------------------------------------------------------------------------------

-- Load a settlement for an action. p_role: 'creator' (edit/delete/restore) or 'receiver'.
create function public.settlement_for_change(p_settlement_id uuid, p_role text)
returns public.settlements
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.settlements;
  v_left text;
begin
  select * into v from public.settlements where id = p_settlement_id for update;
  if v.id is null or not public.is_member(v.group_id) then
    raise exception 'Payment not found';
  end if;
  perform public.assert_group_writable(v.group_id);

  if p_role = 'creator' and v.created_by is distinct from (select auth.uid()) then
    raise exception 'Only the person who recorded this payment can change it';
  end if;
  if p_role = 'receiver' and not exists (
    select 1 from public.group_members
    where id = v.to_member and user_id = (select auth.uid()) and left_at is null
  ) then
    raise exception 'Only the person who received this payment can do that';
  end if;

  select display_name into v_left from public.group_members
  where id in (v.from_member, v.to_member) and left_at is not null
  limit 1;
  if v_left is not null then
    raise exception '% has left the group, so this payment is locked', v_left;
  end if;
  return v;
end;
$$;

create function public.settlement_payload(v public.settlements)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'from', (select display_name from public.group_members where id = v.from_member),
    'to', (select display_name from public.group_members where id = v.to_member),
    'amount', v.amount, 'currency', v.currency, 'method', v.method, 'status', v.status
  );
$$;

create function public.record_settlement(
  p_group_id uuid,
  p_from_member uuid,
  p_to_member uuid,
  p_amount bigint,
  p_method text,
  p_client_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_actor uuid := public.my_member_id(p_group_id);
  v_currency text;
  v_status text;
  v public.settlements;
begin
  perform public.assert_group_writable(p_group_id);

  if p_client_id is not null then
    select * into v from public.settlements
    where client_id = p_client_id and group_id = p_group_id and created_by = v_uid;
    if v.id is not null then
      return v.id;
    end if;
  end if;

  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount'; end if;
  if p_from_member is null or p_to_member is null or p_from_member = p_to_member then
    raise exception 'Pick who paid whom';
  end if;
  if p_method is null or p_method not in ('upi', 'cash', 'other') then raise exception 'Unknown payment method'; end if;
  if (select count(*) from public.group_members
      where id in (p_from_member, p_to_member) and group_id = p_group_id and left_at is null) <> 2 then
    raise exception 'Both people must be in the group';
  end if;
  if v_actor not in (p_from_member, p_to_member) then
    raise exception 'You can only record payments you made or received';
  end if;

  select base_currency into v_currency from public.groups where id = p_group_id;
  if p_method = 'upi' and v_currency <> 'INR' then
    raise exception 'UPI is only for groups in INR';
  end if;

  -- Recorded by the receiver = they're confirming it themselves.
  v_status := case when v_actor = p_to_member then 'confirmed' else 'pending' end;

  insert into public.settlements (
    group_id, from_member, to_member, amount, currency, amount_base, method, status, client_id, created_by
  )
  values (p_group_id, p_from_member, p_to_member, p_amount, v_currency, p_amount, p_method, v_status, p_client_id, v_uid)
  returning * into v;

  perform public.log_activity(p_group_id, v_actor, 'settlement_recorded', v.id, public.settlement_payload(v));
  return v.id;
end;
$$;

create function public.confirm_settlement(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.settlements;
begin
  perform public.require_uid();
  v := public.settlement_for_change(p_settlement_id, 'receiver');
  if v.deleted_at is not null then raise exception 'This payment was deleted'; end if;
  if v.status = 'confirmed' then return; end if;
  update public.settlements set status = 'confirmed' where id = v.id returning * into v;
  perform public.log_activity(v.group_id, v.to_member, 'settlement_confirmed', v.id, public.settlement_payload(v));
end;
$$;

-- A disputed payment stops counting toward balances until it's edited or deleted.
create function public.dispute_settlement(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.settlements;
begin
  perform public.require_uid();
  v := public.settlement_for_change(p_settlement_id, 'receiver');
  if v.deleted_at is not null then raise exception 'This payment was deleted'; end if;
  if v.created_by is not distinct from (select auth.uid()) then
    raise exception 'You recorded this payment yourself. Edit or delete it instead.';
  end if;
  if v.status = 'disputed' then return; end if;
  update public.settlements set status = 'disputed' where id = v.id returning * into v;
  perform public.log_activity(v.group_id, v.to_member, 'settlement_disputed', v.id, public.settlement_payload(v));
end;
$$;

-- Edit amount/method. Payer-recorded → back to pending (the receiver checks again);
-- receiver-recorded → stays confirmed.
create function public.update_settlement(p_settlement_id uuid, p_amount bigint, p_method text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.settlements;
  v_by_receiver boolean;
begin
  perform public.require_uid();
  v := public.settlement_for_change(p_settlement_id, 'creator');
  if v.deleted_at is not null then raise exception 'This payment was deleted'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount'; end if;
  if p_method is null or p_method not in ('upi', 'cash', 'other') then raise exception 'Unknown payment method'; end if;
  if p_method = 'upi' and v.currency <> 'INR' then raise exception 'UPI is only for groups in INR'; end if;

  v_by_receiver := exists (
    select 1 from public.group_members where id = v.to_member and user_id = (select auth.uid())
  );
  update public.settlements
  set amount = p_amount, amount_base = p_amount, method = p_method,
      status = case when v_by_receiver then 'confirmed' else 'pending' end
  where id = v.id
  returning * into v;
  perform public.log_activity(v.group_id, public.my_member_id(v.group_id), 'settlement_updated', v.id, public.settlement_payload(v));
end;
$$;

create function public.delete_settlement(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.settlements;
begin
  perform public.require_uid();
  v := public.settlement_for_change(p_settlement_id, 'creator');
  if v.deleted_at is not null then return; end if;
  update public.settlements set deleted_at = now() where id = v.id;
  perform public.log_activity(v.group_id, public.my_member_id(v.group_id), 'settlement_deleted', v.id, public.settlement_payload(v));
end;
$$;

create function public.restore_settlement(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.settlements;
begin
  perform public.require_uid();
  v := public.settlement_for_change(p_settlement_id, 'creator');
  if v.deleted_at is null then return; end if;
  update public.settlements set deleted_at = null where id = v.id;
  perform public.log_activity(v.group_id, public.my_member_id(v.group_id), 'settlement_restored', v.id, public.settlement_payload(v));
end;
$$;

------------------------------------------------------------------------------------------------
-- Expenses in any currency: amount is in the expense currency; amount_base = round(amount × rate)
-- and every payer/split line is in base and must sum to amount_base (validated server-side).
------------------------------------------------------------------------------------------------

drop function if exists public.create_expense(uuid, text, bigint, text, date, text, text, jsonb, jsonb, uuid);
drop function if exists public.update_expense(uuid, text, bigint, text, date, text, text, jsonb, jsonb);

-- Validates currency + rate against the group and returns amount_base.
create function public.expense_amount_base(p_group_id uuid, p_amount bigint, p_currency text, p_fx_rate numeric)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_amount_base numeric;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount'; end if;
  if p_currency is null or p_currency not in ('INR', 'USD', 'AUD', 'EUR', 'GBP') then
    raise exception 'Unsupported currency';
  end if;
  select base_currency into v_base from public.groups where id = p_group_id;
  if p_currency = v_base then
    if p_fx_rate is distinct from 1 then raise exception 'Expenses in the group currency use a rate of 1'; end if;
  elsif p_fx_rate is null or p_fx_rate <= 0 or p_fx_rate >= 1000000000 then
    raise exception 'Enter a valid exchange rate';
  elsif p_fx_rate <> round(p_fx_rate, 10) then
    raise exception 'Exchange rates can have at most 10 decimals';
  end if;

  v_amount_base := round(p_amount * p_fx_rate);
  if v_amount_base <= 0 then raise exception 'That amount is too small after conversion'; end if;
  if v_amount_base > 9007199254740991 then raise exception 'That amount is too large'; end if;
  return v_amount_base::bigint;
end;
$$;

create function public.create_expense(
  p_group_id uuid,
  p_title text,
  p_amount bigint,
  p_currency text,
  p_fx_rate numeric,
  p_category text,
  p_date date,
  p_note text,
  p_split_type text,
  p_payers jsonb,
  p_splits jsonb,
  p_client_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_actor uuid := public.my_member_id(p_group_id);
  v_amount_base bigint;
  v_base text;
  v_id uuid;
begin
  perform public.assert_group_writable(p_group_id);

  if p_client_id is not null then
    select id into v_id from public.expenses
    where client_id = p_client_id and group_id = p_group_id and created_by = v_uid;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if char_length(btrim(coalesce(p_title, ''))) = 0 then raise exception 'Give it a name'; end if;
  v_amount_base := public.expense_amount_base(p_group_id, p_amount, p_currency, p_fx_rate);
  select base_currency into v_base from public.groups where id = p_group_id;

  insert into public.expenses (
    group_id, title, amount, currency, fx_rate_to_base, amount_base, category, date, note, created_by, client_id
  )
  values (
    p_group_id, btrim(p_title), p_amount, p_currency, p_fx_rate, v_amount_base, coalesce(p_category, 'other'),
    coalesce(p_date, current_date), nullif(btrim(coalesce(p_note, '')), ''), v_uid, p_client_id
  )
  returning id into v_id;

  perform public.write_expense_lines(v_id, p_group_id, v_amount_base, p_split_type, p_payers, p_splits);
  perform public.log_activity(p_group_id, v_actor, 'expense_created', v_id,
    jsonb_build_object('title', btrim(p_title), 'amount', p_amount, 'currency', p_currency,
                       'amount_base', v_amount_base, 'base_currency', v_base));
  return v_id;
end;
$$;

create function public.update_expense(
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

  perform public.write_expense_lines(p_expense_id, v_expense.group_id, v_amount_base, p_split_type, p_payers, p_splits);
  perform public.log_activity(v_expense.group_id, public.my_member_id(v_expense.group_id), 'expense_updated', p_expense_id,
    jsonb_build_object('title', btrim(p_title), 'amount', p_amount, 'currency', p_currency,
                       'amount_base', v_amount_base, 'previous_amount_base', v_expense.amount_base));
end;
$$;

------------------------------------------------------------------------------------------------
-- Grants
------------------------------------------------------------------------------------------------

revoke execute on function
  public.settlement_for_change(uuid, text), public.settlement_payload(public.settlements),
  public.expense_amount_base(uuid, bigint, text, numeric),
  public.record_settlement(uuid, uuid, uuid, bigint, text, uuid),
  public.confirm_settlement(uuid), public.dispute_settlement(uuid),
  public.update_settlement(uuid, bigint, text),
  public.delete_settlement(uuid), public.restore_settlement(uuid),
  public.create_expense(uuid, text, bigint, text, numeric, text, date, text, text, jsonb, jsonb, uuid),
  public.update_expense(uuid, text, bigint, text, numeric, text, date, text, text, jsonb, jsonb)
from public, anon;

revoke execute on function
  public.settlement_for_change(uuid, text), public.settlement_payload(public.settlements),
  public.expense_amount_base(uuid, bigint, text, numeric)
from authenticated;

grant execute on function
  public.record_settlement(uuid, uuid, uuid, bigint, text, uuid),
  public.confirm_settlement(uuid), public.dispute_settlement(uuid),
  public.update_settlement(uuid, bigint, text),
  public.delete_settlement(uuid), public.restore_settlement(uuid),
  public.create_expense(uuid, text, bigint, text, numeric, text, date, text, text, jsonb, jsonb, uuid),
  public.update_expense(uuid, text, bigint, text, numeric, text, date, text, text, jsonb, jsonb)
to authenticated;

grant select on public.fx_rates to authenticated;
revoke all on public.fx_rates from anon;
revoke insert, update, delete on public.fx_rates from authenticated;
revoke insert, update, delete on public.settlements from anon, authenticated;

notify pgrst, 'reload schema';
