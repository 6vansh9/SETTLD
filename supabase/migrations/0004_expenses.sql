-- Milestone 4: money core (PRD.md › Expenses, Balances, Data model)
-- Requires 0001–0003. All money is bigint minor units. In this milestone every expense is in the
-- group's base currency (fx_rate_to_base = 1, amount_base = amount); FX arrives in Milestone 5.

------------------------------------------------------------------------------------------------
-- Members who leave: keep the row (old expenses keep their name), mark it left.
------------------------------------------------------------------------------------------------

alter table public.group_members add column if not exists left_at timestamptz;

-- Membership checks only count people who haven't left.
create or replace function public.is_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = (select auth.uid()) and left_at is null
  );
$$;

create or replace function public.is_admin(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = (select auth.uid()) and role = 'admin' and left_at is null
  );
$$;

-- You can see the profile (avatar color) of anyone in a group you're currently in,
-- including people who have left it, so their past expenses still render properly.
create or replace function public.shares_group(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = (select auth.uid()) and mine.left_at is null and theirs.user_id = p_user_id
  );
$$;

------------------------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------------------------

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 80),
  amount bigint not null check (amount > 0),
  currency text not null check (currency in ('INR', 'USD', 'AUD', 'EUR', 'GBP')),
  fx_rate_to_base numeric(20, 10) not null default 1 check (fx_rate_to_base > 0),
  amount_base bigint not null check (amount_base > 0),
  category text not null default 'other' check (category in (
    'food', 'travel', 'stay', 'groceries', 'rent', 'utilities',
    'entertainment', 'shopping', 'subscriptions', 'other'
  )),
  date date not null default current_date,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references public.profiles (id) on delete set null,
  -- Client-generated id: retries and (M9) offline replays never create duplicates.
  client_id uuid unique,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_group_date_idx on public.expenses (group_id, date desc, created_at desc);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

create table public.expense_payers (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  member_id uuid not null references public.group_members (id),
  amount_base bigint not null check (amount_base > 0),
  primary key (expense_id, member_id)
);

create index expense_payers_member_idx on public.expense_payers (member_id);

create table public.expense_splits (
  expense_id uuid not null references public.expenses (id) on delete cascade,
  member_id uuid not null references public.group_members (id),
  amount_base bigint not null check (amount_base >= 0),
  split_type text not null check (split_type in ('equal', 'exact', 'percent', 'shares')),
  -- As entered: exact = minor units, percent = basis points (33.33% = 3333), shares = count.
  raw_value numeric,
  primary key (expense_id, member_id)
);

create index expense_splits_member_idx on public.expense_splits (member_id);

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  actor_member uuid references public.group_members (id),
  kind text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_group_created_idx on public.activity (group_id, created_at desc);

------------------------------------------------------------------------------------------------
-- Balances: one row per member (including members who left), paid − owed.
------------------------------------------------------------------------------------------------

create view public.group_balances
with (security_invoker = true)  -- the caller's RLS applies, so you only see your groups
as
select
  m.group_id,
  m.id as member_id,
  coalesce(p.paid, 0)::bigint as paid,
  coalesce(s.owed, 0)::bigint as owed,
  -- Milestone 5: settlements sent (+) and received (−) get added here.
  0::bigint as settlements_sent,
  0::bigint as settlements_received,
  (coalesce(p.paid, 0) - coalesce(s.owed, 0))::bigint as net
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
) s on s.member_id = m.id;

------------------------------------------------------------------------------------------------
-- Row-level security: read-only for members; all writes go through the RPCs below.
------------------------------------------------------------------------------------------------

alter table public.expenses enable row level security;
alter table public.expense_payers enable row level security;
alter table public.expense_splits enable row level security;
alter table public.activity enable row level security;

create policy "Members can read expenses"
  on public.expenses for select to authenticated
  using (public.is_member(group_id));

create policy "Members can read expense payers"
  on public.expense_payers for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_member(e.group_id)));

create policy "Members can read expense splits"
  on public.expense_splits for select to authenticated
  using (exists (select 1 from public.expenses e where e.id = expense_id and public.is_member(e.group_id)));

create policy "Members can read activity"
  on public.activity for select to authenticated
  using (public.is_member(group_id));

------------------------------------------------------------------------------------------------
-- Internal helpers
------------------------------------------------------------------------------------------------

-- The caller's active member row in a group, or an error.
create function public.my_member_id(p_group_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.group_members
  where group_id = p_group_id and user_id = (select auth.uid()) and left_at is null;
  if v_id is null then
    raise exception 'You''re not in this group';
  end if;
  return v_id;
end;
$$;

create function public.assert_group_writable(p_group_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.groups where id = p_group_id and archived_at is not null) then
    raise exception 'This group is archived';
  end if;
end;
$$;

create function public.log_activity(p_group_id uuid, p_actor uuid, p_kind text, p_entity uuid, p_payload jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity (group_id, actor_member, kind, entity_id, payload)
  values (p_group_id, p_actor, p_kind, p_entity, coalesce(p_payload, '{}'::jsonb));
$$;

-- Validate and write payers + splits for an expense (replacing any existing lines).
-- p_payers: [{member_id, amount}] · p_splits: [{member_id, amount, raw_value}]
create function public.write_expense_lines(
  p_expense_id uuid,
  p_group_id uuid,
  p_amount bigint,
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
  v_count int;
  v_distinct int;
  v_sum numeric;
  v_bad int;
begin
  if p_split_type is null or p_split_type not in ('equal', 'exact', 'percent', 'shares') then
    raise exception 'Unknown split type';
  end if;
  if jsonb_typeof(p_payers) is distinct from 'array' or jsonb_typeof(p_splits) is distinct from 'array' then
    raise exception 'Payers and splits must be lists';
  end if;

  -- Payers: at least one, distinct, active members of this group, amounts > 0, sum = amount.
  select count(*), count(distinct member_id), coalesce(sum(amount), 0)
    into v_count, v_distinct, v_sum
  from jsonb_to_recordset(p_payers) as x(member_id uuid, amount bigint);
  if v_count = 0 then raise exception 'Pick who paid'; end if;
  if v_distinct <> v_count then raise exception 'Someone is listed as paying twice'; end if;
  select count(*) into v_bad from jsonb_to_recordset(p_payers) as x(member_id uuid, amount bigint)
  where amount is null or amount <= 0;
  if v_bad > 0 then raise exception 'Each payer needs an amount'; end if;
  if v_sum <> p_amount then
    raise exception 'Paid amounts (%) must add up to the total (%)', v_sum, p_amount;
  end if;
  select count(*) into v_bad from jsonb_to_recordset(p_payers) as x(member_id uuid, amount bigint)
  where not exists (
    select 1 from public.group_members m
    where m.id = x.member_id and m.group_id = p_group_id and m.left_at is null
  );
  if v_bad > 0 then raise exception 'Every payer must be in the group'; end if;

  -- Splits: at least one, distinct, active members, amounts >= 0 (one > 0), sum = amount.
  select count(*), count(distinct member_id), coalesce(sum(amount), 0)
    into v_count, v_distinct, v_sum
  from jsonb_to_recordset(p_splits) as x(member_id uuid, amount bigint, raw_value numeric);
  if v_count = 0 then raise exception 'Pick at least one person to split with'; end if;
  if v_distinct <> v_count then raise exception 'Someone is in the split twice'; end if;
  select count(*) into v_bad from jsonb_to_recordset(p_splits) as x(member_id uuid, amount bigint, raw_value numeric)
  where amount is null or amount < 0;
  if v_bad > 0 then raise exception 'Split amounts can''t be negative'; end if;
  if v_sum <> p_amount then
    raise exception 'Splits (%) must add up to the total (%)', v_sum, p_amount;
  end if;
  select count(*) into v_bad from jsonb_to_recordset(p_splits) as x(member_id uuid, amount bigint, raw_value numeric)
  where not exists (
    select 1 from public.group_members m
    where m.id = x.member_id and m.group_id = p_group_id and m.left_at is null
  );
  if v_bad > 0 then raise exception 'Everyone in the split must be in the group'; end if;

  -- Per-type sanity on the values as entered.
  if p_split_type = 'percent' then
    select coalesce(sum(raw_value), 0) into v_sum
    from jsonb_to_recordset(p_splits) as x(member_id uuid, amount bigint, raw_value numeric);
    if v_sum <> 10000 then raise exception 'Percentages must add up to 100%%'; end if;
  elsif p_split_type = 'shares' then
    select count(*) into v_bad from jsonb_to_recordset(p_splits) as x(member_id uuid, amount bigint, raw_value numeric)
    where raw_value is null or raw_value < 0 or raw_value <> trunc(raw_value);
    if v_bad > 0 then raise exception 'Shares must be whole numbers'; end if;
  end if;

  delete from public.expense_payers where expense_id = p_expense_id;
  delete from public.expense_splits where expense_id = p_expense_id;

  insert into public.expense_payers (expense_id, member_id, amount_base)
  select p_expense_id, x.member_id, x.amount
  from jsonb_to_recordset(p_payers) as x(member_id uuid, amount bigint);

  insert into public.expense_splits (expense_id, member_id, amount_base, split_type, raw_value)
  select p_expense_id, x.member_id, x.amount, p_split_type,
         case when p_split_type = 'equal' then null else x.raw_value end
  from jsonb_to_recordset(p_splits) as x(member_id uuid, amount bigint, raw_value numeric);
end;
$$;

-- Load an expense the caller may change: exists, group writable, creator or admin,
-- and no departed members on it (their balance must stay exactly zero).
create function public.expense_for_change(p_expense_id uuid, p_verb text)
returns public.expenses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense public.expenses;
  v_left text;
begin
  select * into v_expense from public.expenses where id = p_expense_id for update;
  if v_expense.id is null or not public.is_member(v_expense.group_id) then
    raise exception 'Expense not found';
  end if;
  perform public.assert_group_writable(v_expense.group_id);
  if v_expense.created_by is distinct from (select auth.uid()) and not public.is_admin(v_expense.group_id) then
    raise exception 'Only the person who added it or an admin can % it', p_verb;
  end if;

  select m.display_name into v_left
  from public.group_members m
  where m.left_at is not null and m.id in (
    select member_id from public.expense_payers where expense_id = p_expense_id
    union select member_id from public.expense_splits where expense_id = p_expense_id
  )
  limit 1;
  if v_left is not null then
    raise exception '% has left the group, so this expense is locked', v_left;
  end if;

  return v_expense;
end;
$$;

------------------------------------------------------------------------------------------------
-- Expense RPCs
------------------------------------------------------------------------------------------------

create function public.create_expense(
  p_group_id uuid,
  p_title text,
  p_amount bigint,
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
  v_currency text;
  v_id uuid;
begin
  perform public.assert_group_writable(p_group_id);

  -- Idempotent retries: the same client_id returns the expense it already created.
  if p_client_id is not null then
    select id into v_id from public.expenses
    where client_id = p_client_id and group_id = p_group_id and created_by = v_uid;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount'; end if;
  if char_length(btrim(coalesce(p_title, ''))) = 0 then raise exception 'Give it a name'; end if;

  select base_currency into v_currency from public.groups where id = p_group_id;

  insert into public.expenses (
    group_id, title, amount, currency, fx_rate_to_base, amount_base, category, date, note, created_by, client_id
  )
  values (
    p_group_id, btrim(p_title), p_amount, v_currency, 1, p_amount, coalesce(p_category, 'other'),
    coalesce(p_date, current_date), nullif(btrim(coalesce(p_note, '')), ''), v_uid, p_client_id
  )
  returning id into v_id;

  perform public.write_expense_lines(v_id, p_group_id, p_amount, p_split_type, p_payers, p_splits);
  perform public.log_activity(p_group_id, v_actor, 'expense_created', v_id,
    jsonb_build_object('title', btrim(p_title), 'amount', p_amount, 'currency', v_currency));
  return v_id;
end;
$$;

create function public.update_expense(
  p_expense_id uuid,
  p_title text,
  p_amount bigint,
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
begin
  perform public.require_uid();
  v_expense := public.expense_for_change(p_expense_id, 'edit');
  if v_expense.deleted_at is not null then raise exception 'This expense was deleted'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter an amount'; end if;
  if char_length(btrim(coalesce(p_title, ''))) = 0 then raise exception 'Give it a name'; end if;

  update public.expenses
  set title = btrim(p_title), amount = p_amount, amount_base = p_amount, fx_rate_to_base = 1,
      category = coalesce(p_category, 'other'), date = coalesce(p_date, date),
      note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_expense_id;

  perform public.write_expense_lines(p_expense_id, v_expense.group_id, p_amount, p_split_type, p_payers, p_splits);
  perform public.log_activity(v_expense.group_id, public.my_member_id(v_expense.group_id), 'expense_updated', p_expense_id,
    jsonb_build_object('title', btrim(p_title), 'amount', p_amount, 'currency', v_expense.currency,
                       'previous_amount', v_expense.amount));
end;
$$;

-- Soft delete (the UI offers Undo for 10 seconds via restore_expense).
create function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense public.expenses;
begin
  perform public.require_uid();
  v_expense := public.expense_for_change(p_expense_id, 'delete');
  if v_expense.deleted_at is not null then
    return;
  end if;
  update public.expenses set deleted_at = now() where id = p_expense_id;
  perform public.log_activity(v_expense.group_id, public.my_member_id(v_expense.group_id), 'expense_deleted', p_expense_id,
    jsonb_build_object('title', v_expense.title, 'amount', v_expense.amount, 'currency', v_expense.currency));
end;
$$;

create function public.restore_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expense public.expenses;
begin
  perform public.require_uid();
  v_expense := public.expense_for_change(p_expense_id, 'restore');
  if v_expense.deleted_at is null then
    return;
  end if;
  update public.expenses set deleted_at = null where id = p_expense_id;
  perform public.log_activity(v_expense.group_id, public.my_member_id(v_expense.group_id), 'expense_restored', p_expense_id,
    jsonb_build_object('title', v_expense.title, 'amount', v_expense.amount, 'currency', v_expense.currency));
end;
$$;

------------------------------------------------------------------------------------------------
-- Membership RPCs from 0002, updated for left_at
------------------------------------------------------------------------------------------------

-- Remove = mark as left, only at a zero balance. The row stays so old expenses keep the name.
create or replace function public.remove_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_member public.group_members;
  v_net bigint;
begin
  select * into v_member from public.group_members where id = p_member_id;
  if v_member.id is null or not public.is_admin(v_member.group_id) then
    raise exception 'Only admins can remove people';
  end if;
  if v_member.left_at is not null then
    return;
  end if;
  if v_member.user_id = v_uid then
    raise exception 'You can''t remove yourself';
  end if;
  perform public.assert_group_writable(v_member.group_id);

  select net into v_net from public.group_balances where member_id = p_member_id;
  if coalesce(v_net, 0) <> 0 then
    raise exception '% still has a balance in this group. Settle up first.', v_member.display_name;
  end if;

  update public.group_members set left_at = now() where id = p_member_id;
  update public.invites set revoked_at = now() where ghost_member_id = p_member_id and revoked_at is null;
  perform public.log_activity(v_member.group_id, public.my_member_id(v_member.group_id), 'member_removed', p_member_id,
    jsonb_build_object('name', v_member.display_name));
end;
$$;

create or replace function public.preview_invite(p_token text)
returns table (name text, emoji text, color text, member_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select g.name, g.emoji, g.color,
         (select count(*) from public.group_members m where m.group_id = g.id and m.left_at is null)::integer
  from public.invites i
  join public.groups g on g.id = i.group_id
  where i.token = p_token and i.revoked_at is null and g.archived_at is null;
$$;

create or replace function public.invite_details(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_invite public.invites;
  v_claim public.group_members;
begin
  select i.* into v_invite
  from public.invites i
  join public.groups g on g.id = i.group_id
  where i.token = p_token and i.revoked_at is null and g.archived_at is null;

  if not found then
    return null;
  end if;

  if exists (
    select 1 from public.group_members
    where group_id = v_invite.group_id and user_id = v_uid and left_at is null
  ) then
    return jsonb_build_object('member_group_id', v_invite.group_id, 'ghosts', '[]'::jsonb, 'claim', null);
  end if;

  if v_invite.ghost_member_id is not null then
    select * into v_claim from public.group_members
    where id = v_invite.ghost_member_id and is_ghost and left_at is null;
  end if;

  return jsonb_build_object(
    'member_group_id', null,
    'ghosts', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'display_name', m.display_name) order by m.joined_at)
      from public.group_members m
      where m.group_id = v_invite.group_id and m.is_ghost and m.left_at is null
    ), '[]'::jsonb),
    'claim', case when v_claim.id is null then null
                  else jsonb_build_object('id', v_claim.id, 'display_name', v_claim.display_name) end
  );
end;
$$;

create or replace function public.take_ghost_slot(p_member_id uuid, p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
begin
  -- Someone who left this group and comes back can't also take a ghost's spot
  -- (one row per person per group); they rejoin as themselves.
  select group_id into v_group from public.group_members where id = p_member_id;
  if exists (select 1 from public.group_members where group_id = v_group and user_id = p_uid) then
    raise exception 'You were in this group before. Use the group link to rejoin.';
  end if;

  update public.group_members
  set user_id = p_uid, is_ghost = false, display_name = public.profile_name(p_uid)
  where id = p_member_id and is_ghost and user_id is null and left_at is null;

  if not found then
    raise exception 'That spot was already claimed';
  end if;

  update public.invites set revoked_at = now()
  where ghost_member_id = p_member_id and revoked_at is null;

  perform public.log_activity(v_group, p_member_id, 'ghost_claimed', p_member_id, '{}'::jsonb);
end;
$$;

create or replace function public.join_group(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_invite public.invites;
  v_archived timestamptz;
  v_existing public.group_members;
  v_member uuid;
begin
  select * into v_invite from public.invites where token = p_token and revoked_at is null;
  if v_invite.id is null then
    raise exception 'This invite link is no longer valid';
  end if;
  select archived_at into v_archived from public.groups where id = v_invite.group_id;
  if v_archived is not null then
    raise exception 'This group is archived';
  end if;

  select * into v_existing from public.group_members where group_id = v_invite.group_id and user_id = v_uid;
  if v_existing.id is not null and v_existing.left_at is null then
    return v_invite.group_id;
  end if;

  if v_existing.id is not null then
    -- Coming back after being removed: reactivate the same row (their history is on it).
    update public.group_members
    set left_at = null, display_name = public.profile_name(v_uid)
    where id = v_existing.id;
    v_member := v_existing.id;
  elsif v_invite.ghost_member_id is not null then
    perform public.take_ghost_slot(v_invite.ghost_member_id, v_uid);
    return v_invite.group_id;
  else
    insert into public.group_members (group_id, user_id, display_name)
    values (v_invite.group_id, v_uid, public.profile_name(v_uid))
    returning id into v_member;
  end if;

  perform public.log_activity(v_invite.group_id, v_member, 'member_joined', v_member, '{}'::jsonb);
  return v_invite.group_id;
end;
$$;

create or replace function public.claim_ghost(p_token text, p_member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_invite public.invites;
  v_archived timestamptz;
  v_member_group uuid;
begin
  select * into v_invite from public.invites where token = p_token and revoked_at is null;
  if v_invite.id is null then
    raise exception 'This invite link is no longer valid';
  end if;
  select archived_at into v_archived from public.groups where id = v_invite.group_id;
  if v_archived is not null then
    raise exception 'This group is archived';
  end if;
  if v_invite.ghost_member_id is not null and v_invite.ghost_member_id <> p_member_id then
    raise exception 'This link is for someone else''s spot';
  end if;

  select group_id into v_member_group from public.group_members where id = p_member_id and left_at is null;
  if v_member_group is distinct from v_invite.group_id then
    raise exception 'That person isn''t in this group';
  end if;

  if exists (
    select 1 from public.group_members
    where group_id = v_invite.group_id and user_id = v_uid and left_at is null
  ) then
    raise exception 'You''re already in this group';
  end if;

  perform public.take_ghost_slot(p_member_id, v_uid);
  return v_invite.group_id;
end;
$$;

create or replace function public.ghost_claim_link(p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_member public.group_members;
  v_token text;
begin
  select * into v_member from public.group_members where id = p_member_id;
  if v_member.id is null or not public.is_admin(v_member.group_id) then
    raise exception 'Only admins can create claim links';
  end if;
  if not v_member.is_ghost or v_member.left_at is not null then
    raise exception 'That person is no longer waiting to join';
  end if;

  select token into v_token from public.invites
  where ghost_member_id = p_member_id and revoked_at is null;

  if v_token is null then
    v_token := public.new_invite_token();
    insert into public.invites (group_id, token, created_by, ghost_member_id)
    values (v_member.group_id, v_token, v_uid, p_member_id);
  end if;

  return v_token;
end;
$$;

create or replace function public.add_ghost(p_group_id uuid, p_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := public.clean_name(p_name, 'Name');
  v_existing text;
  v_id uuid;
begin
  perform public.require_uid();
  if not public.is_admin(p_group_id) then
    raise exception 'Only admins can add people';
  end if;
  perform public.assert_group_writable(p_group_id);

  select display_name into v_existing from public.group_members
  where group_id = p_group_id and lower(display_name) = lower(v_name) and left_at is null
  limit 1;
  if v_existing is not null then
    raise exception '% is already in this group', v_existing;
  end if;

  insert into public.group_members (group_id, display_name, is_ghost)
  values (p_group_id, v_name, true)
  returning id into v_id;
  return v_id;
end;
$$;

-- Admin: toggle "simplify debts" (PRD › Groups).
create function public.set_group_simplify(p_group_id uuid, p_simplify boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_uid();
  if not public.is_admin(p_group_id) then
    raise exception 'Only admins can change this';
  end if;
  perform public.assert_group_writable(p_group_id);
  update public.groups set simplify = coalesce(p_simplify, true) where id = p_group_id;
end;
$$;

------------------------------------------------------------------------------------------------
-- Grants
------------------------------------------------------------------------------------------------

revoke execute on function
  public.my_member_id(uuid), public.assert_group_writable(uuid),
  public.log_activity(uuid, uuid, text, uuid, jsonb),
  public.write_expense_lines(uuid, uuid, bigint, text, jsonb, jsonb),
  public.expense_for_change(uuid, text),
  public.create_expense(uuid, text, bigint, text, date, text, text, jsonb, jsonb, uuid),
  public.update_expense(uuid, text, bigint, text, date, text, text, jsonb, jsonb),
  public.delete_expense(uuid), public.restore_expense(uuid), public.set_group_simplify(uuid, boolean)
from public, anon;

revoke execute on function
  public.my_member_id(uuid), public.assert_group_writable(uuid),
  public.log_activity(uuid, uuid, text, uuid, jsonb),
  public.write_expense_lines(uuid, uuid, bigint, text, jsonb, jsonb),
  public.expense_for_change(uuid, text)
from authenticated;

grant execute on function
  public.create_expense(uuid, text, bigint, text, date, text, text, jsonb, jsonb, uuid),
  public.update_expense(uuid, text, bigint, text, date, text, text, jsonb, jsonb),
  public.delete_expense(uuid), public.restore_expense(uuid), public.set_group_simplify(uuid, boolean)
to authenticated;

grant select on public.group_balances to authenticated;
revoke all on public.group_balances from anon;

notify pgrst, 'reload schema';
