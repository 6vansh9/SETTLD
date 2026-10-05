-- Milestone 7b: Split Room (PRD.md › Headline features › Split Room). Requires 0001–0006. Safe to re-run.
--
-- • Every room belongs to a group. Members of that group can read the room and claim items; anyone
--   with the room code can join the group through join_room (it reuses join_group with the group's
--   live invite link).
-- • Prices are integer minor units in the group's base currency. Tax, service charge and tip are
--   each a percentage (basis points, of the item subtotal) or a fixed amount.
-- • Claims are never hard-deleted (shares = 0 means "not claimed") and removed items are soft-
--   deleted, so every change reaches phones as an INSERT/UPDATE that Realtime can filter by room.
-- • The maths in room_allocate / room_totals mirrors lib/splitRoom.ts exactly.

------------------------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------------------------

create table if not exists public.split_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[2-9A-HJ-NP-Z]{6}$'),
  group_id uuid not null references public.groups (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  host_member uuid not null references public.group_members (id),
  tax_kind text not null default 'percent' check (tax_kind in ('percent', 'amount')),
  tax_value bigint not null default 0,
  service_kind text not null default 'percent' check (service_kind in ('percent', 'amount')),
  service_value bigint not null default 0,
  tip_kind text not null default 'percent' check (tip_kind in ('percent', 'amount')),
  tip_value bigint not null default 0,
  status text not null default 'open' check (status in ('open', 'finalized', 'cancelled', 'expired')),
  paid_by uuid references public.group_members (id),
  expense_id uuid references public.expenses (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '12 hours',
  closed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint split_rooms_charges_valid check (
    tax_value between 0 and 9007199254740991 and service_value between 0 and 9007199254740991
    and tip_value between 0 and 9007199254740991
    and (tax_kind <> 'percent' or tax_value <= 10000)
    and (service_kind <> 'percent' or service_value <= 10000)
    and (tip_kind <> 'percent' or tip_value <= 10000)
  )
);

-- A code is unique among open rooms (finalized/cancelled/expired rooms free theirs up).
create unique index if not exists split_rooms_open_code on public.split_rooms (code) where status = 'open';
create index if not exists split_rooms_group_idx on public.split_rooms (group_id, status);
create index if not exists split_rooms_code_idx on public.split_rooms (code);

create table if not exists public.split_room_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.split_rooms (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  price bigint not null check (price > 0 and price <= 9007199254740991),
  qty integer not null default 1 check (qty between 1 and 999),
  position integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists split_room_items_room_idx on public.split_room_items (room_id);

create table if not exists public.split_room_claims (
  room_id uuid not null references public.split_rooms (id) on delete cascade,
  item_id uuid not null references public.split_room_items (id) on delete cascade,
  member_id uuid not null references public.group_members (id),
  shares integer not null default 1 check (shares between 0 and 99),
  updated_at timestamptz not null default now(),
  primary key (item_id, member_id)
);
create index if not exists split_room_claims_room_idx on public.split_room_claims (room_id);

------------------------------------------------------------------------------------------------
-- RLS: read-only for members of the room's group; every write goes through the RPCs below.
------------------------------------------------------------------------------------------------

alter table public.split_rooms enable row level security;
alter table public.split_room_items enable row level security;
alter table public.split_room_claims enable row level security;

create or replace function public.can_see_room(p_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.split_rooms r where r.id = p_room_id and public.is_member(r.group_id));
$$;

drop policy if exists "Members can read their group's rooms" on public.split_rooms;
create policy "Members can read their group's rooms" on public.split_rooms
  for select to authenticated using (public.is_member(group_id));

drop policy if exists "Members can read room items" on public.split_room_items;
create policy "Members can read room items" on public.split_room_items
  for select to authenticated using (public.can_see_room(room_id));

drop policy if exists "Members can read room claims" on public.split_room_claims;
create policy "Members can read room claims" on public.split_room_claims
  for select to authenticated using (public.can_see_room(room_id));

revoke all on public.split_rooms, public.split_room_items, public.split_room_claims from anon;
revoke insert, update, delete on public.split_rooms, public.split_room_items, public.split_room_claims from authenticated;
grant select on public.split_rooms, public.split_room_items, public.split_room_claims to authenticated;

------------------------------------------------------------------------------------------------
-- Maths (mirrors lib/splitRoom.ts)
------------------------------------------------------------------------------------------------

-- Largest remainder: floor(total × w / W) each, then +1 to the biggest remainders (earlier wins ties).
create or replace function public.room_allocate(p_total bigint, p_weights bigint[])
returns bigint[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  n int := coalesce(array_length(p_weights, 1), 0);
  v_sum numeric := 0;
  v_res bigint[] := '{}';
  v_rem numeric[] := '{}';
  v_left bigint;
  i int;
  r record;
begin
  if p_total is null or p_total < 0 then raise exception 'Bad total'; end if;
  for i in 1..n loop
    if p_weights[i] is null or p_weights[i] < 0 then raise exception 'Bad weight'; end if;
    v_sum := v_sum + p_weights[i];
  end loop;
  if v_sum = 0 then
    if p_total = 0 then return array_fill(0::bigint, array[n]); end if;
    raise exception 'Nothing to allocate over';
  end if;
  for i in 1..n loop
    v_res := v_res || div(p_total::numeric * p_weights[i], v_sum)::bigint;
    v_rem := v_rem || mod(p_total::numeric * p_weights[i], v_sum);
  end loop;
  v_left := p_total - (select coalesce(sum(x), 0) from unnest(v_res) as x);
  for r in
    select t.ord from unnest(p_weights, v_rem) with ordinality as t(w, rem, ord)
    where t.w > 0 order by t.rem desc, t.ord asc limit v_left
  loop
    v_res[r.ord] := v_res[r.ord] + 1;
  end loop;
  return v_res;
end;
$$;

-- A charge in minor units: percent (basis points) of the subtotal rounded half up, or the amount.
create or replace function public.room_charge(p_kind text, p_value bigint, p_subtotal bigint)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case when p_kind = 'amount' then p_value
              else div(p_subtotal::numeric * p_value + 5000, 10000)::bigint end;
$$;

-- Each claimant's total for a fully claimed room, ordered by member id.
create or replace function public.room_totals(p_room_id uuid)
returns table (member_id uuid, items bigint, tax bigint, service bigint, tip bigint, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_room public.split_rooms;
  v_people uuid[];
  v_items bigint[];
  v_sub numeric := 0;
  v_members uuid[];
  v_shares bigint[];
  v_parts bigint[];
  a_tax bigint[];
  a_service bigint[];
  a_tip bigint[];
  n int;
  k int;
  p int;
  it record;
begin
  select * into v_room from public.split_rooms where id = p_room_id;
  select array_agg(distinct c.member_id order by c.member_id) into v_people
  from public.split_room_claims c
  join public.split_room_items i on i.id = c.item_id
  where c.room_id = p_room_id and c.shares > 0 and i.deleted_at is null;
  v_people := coalesce(v_people, '{}');
  n := coalesce(array_length(v_people, 1), 0);
  v_items := array_fill(0::bigint, array[n]);

  for it in
    select i.id, i.price::numeric * i.qty as cost
    from public.split_room_items i where i.room_id = p_room_id and i.deleted_at is null
  loop
    v_sub := v_sub + it.cost;
    select array_agg(c.member_id order by c.member_id), array_agg(c.shares::bigint order by c.member_id)
      into v_members, v_shares
    from public.split_room_claims c where c.item_id = it.id and c.shares > 0;
    if v_members is null then raise exception 'Every item needs at least one person'; end if;
    v_parts := public.room_allocate(it.cost::bigint, v_shares);
    for k in 1..array_length(v_members, 1) loop
      p := array_position(v_people, v_members[k]);
      v_items[p] := v_items[p] + v_parts[k];
    end loop;
  end loop;
  if v_sub > 9007199254740991 then raise exception 'That bill is too large'; end if;

  a_tax := public.room_allocate(public.room_charge(v_room.tax_kind, v_room.tax_value, v_sub::bigint), v_items);
  a_service := public.room_allocate(public.room_charge(v_room.service_kind, v_room.service_value, v_sub::bigint), v_items);
  a_tip := public.room_allocate(public.room_charge(v_room.tip_kind, v_room.tip_value, v_sub::bigint), v_items);

  return query
    select v_people[g], v_items[g], a_tax[g], a_service[g], a_tip[g], v_items[g] + a_tax[g] + a_service[g] + a_tip[g]
    from generate_series(1, n) as g;
end;
$$;

------------------------------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------------------------------

-- The room a code points at: the open one, else the most recent.
create or replace function public.room_by_code(p_code text)
returns public.split_rooms
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.split_rooms
  where code = upper(btrim(coalesce(p_code, '')))
  order by (status = 'open') desc, created_at desc
  limit 1;
$$;

-- Lock a room the caller may change: in its group, open, not expired; host-only when asked.
create or replace function public.room_for_change(p_room_id uuid, p_host_only boolean)
returns public.split_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.split_rooms;
begin
  select * into v_room from public.split_rooms where id = p_room_id for update;
  if v_room.id is null or not public.is_member(v_room.group_id) then
    raise exception 'Room not found';
  end if;
  if v_room.status = 'finalized' then raise exception 'This room is already finalized'; end if;
  if v_room.status = 'cancelled' then raise exception 'This room was closed by the host'; end if;
  if v_room.status = 'expired' or v_room.expires_at <= now() then raise exception 'This room has expired'; end if;
  perform public.assert_group_writable(v_room.group_id);
  if p_host_only and v_room.host_member <> public.my_member_id(v_room.group_id) then
    raise exception 'Only the host can do that';
  end if;
  return v_room;
end;
$$;

create or replace function public.room_item_room(p_item_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_room uuid;
begin
  select room_id into v_room from public.split_room_items where id = p_item_id and deleted_at is null;
  if v_room is null then raise exception 'That item was removed'; end if;
  return v_room;
end;
$$;

create or replace function public.set_room_claim(p_room public.split_rooms, p_item_id uuid, p_member_id uuid, p_shares int)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_shares is null or p_shares < 0 or p_shares > 99 then raise exception 'Shares must be between 0 and 99'; end if;
  if not exists (
    select 1 from public.group_members
    where id = p_member_id and group_id = p_room.group_id and left_at is null
  ) then
    raise exception 'That person isn''t in this group';
  end if;
  insert into public.split_room_claims (room_id, item_id, member_id, shares)
  values (p_room.id, p_item_id, p_member_id, p_shares)
  on conflict (item_id, member_id) do update set shares = excluded.shares, updated_at = now();
end;
$$;

------------------------------------------------------------------------------------------------
-- RPCs
------------------------------------------------------------------------------------------------

create or replace function public.create_room(p_group_id uuid, p_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_host uuid := public.my_member_id(p_group_id);
  v_alpha constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_name text := btrim(coalesce(p_name, ''));
  v_bytes bytea;
  v_code text;
  v_id uuid;
  i int;
begin
  perform public.assert_group_writable(p_group_id);
  if char_length(v_name) = 0 then v_name := 'Split Room'; end if;
  if char_length(v_name) > 60 then raise exception 'Keep the name under 60 characters'; end if;

  -- Housekeeping: rooms past their 12 hours give their codes back.
  update public.split_rooms set status = 'expired', closed_at = now(), updated_at = now()
  where status = 'open' and expires_at <= now();

  loop
    v_bytes := uuid_send(gen_random_uuid());
    v_code := '';
    for i in 0..5 loop
      v_code := v_code || substr(v_alpha, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    begin
      insert into public.split_rooms (code, group_id, name, host_member)
      values (v_code, p_group_id, v_name, v_host)
      returning id into v_id;
      exit;
    exception when unique_violation then
      -- code taken by another open room: draw again
    end;
  end loop;

  perform public.log_activity(p_group_id, v_host, 'room_opened', v_id, jsonb_build_object('name', v_name, 'code', v_code));
  return jsonb_build_object('id', v_id, 'code', v_code);
end;
$$;

-- Public preview by code (works signed out): room and group basics only. The group id is only
-- returned to members.
create or replace function public.room_preview(p_code text)
returns table (
  room_id uuid, room_name text, status text, expired boolean, group_id uuid,
  group_name text, emoji text, color text, member_count integer, is_member boolean, host_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_member(r.group_id) then r.id end,
         r.name,
         r.status,
         r.status = 'expired' or (r.status = 'open' and r.expires_at <= now()),
         case when public.is_member(r.group_id) then r.group_id end,
         g.name, g.emoji, g.color,
         (select count(*) from public.group_members m where m.group_id = g.id and m.left_at is null)::integer,
         public.is_member(r.group_id),
         (select m.display_name from public.group_members m where m.id = r.host_member)
  from public.room_by_code(p_code) r
  join public.groups g on g.id = r.group_id
  where r.id is not null;
$$;

-- Open a room by code. Not in the group yet? Join it (same path as the group's invite link).
create or replace function public.join_room(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_room public.split_rooms := public.room_by_code(p_code);
  v_token text;
begin
  if v_room.id is null then raise exception 'Room not found'; end if;
  if not public.is_member(v_room.group_id) then
    if v_room.status <> 'open' or v_room.expires_at <= now() then
      raise exception 'This room is closed';
    end if;
    perform public.assert_group_writable(v_room.group_id);
    select token into v_token from public.invites
    where group_id = v_room.group_id and revoked_at is null and ghost_member_id is null
    order by created_at desc limit 1;
    if v_token is null then raise exception 'This group isn''t taking new members right now'; end if;
    perform public.join_group(v_token);
  end if;
  return jsonb_build_object('room_id', v_room.id, 'group_id', v_room.group_id, 'code', v_room.code);
end;
$$;

-- Host: replace the item list (ids are client-generated so edits are idempotent), and optionally
-- the charges {tax|service|tip: {kind, value}} and the name. Items left out are removed;
-- p_items null leaves the items as they are.
create or replace function public.upsert_items(p_room_id uuid, p_items jsonb, p_charges jsonb default null, p_name text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.split_rooms := public.room_for_change(p_room_id, true);
  v_count int;
  v_distinct int;
  v_bad int;
  v_sub numeric;
  k text;
  v_kind text;
  v_value bigint;
begin
  -- p_items null = leave the items alone (saving only charges or the name).
  if p_items is not null then
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Items must be a list'; end if;

  select count(*), count(distinct id) into v_count, v_distinct
  from jsonb_to_recordset(p_items) as x(id uuid, name text, price bigint, qty int);
  if v_count > 200 then raise exception 'That''s a lot of items. Keep it under 200.'; end if;
  if v_distinct <> v_count then raise exception 'An item is listed twice'; end if;
  select count(*) into v_bad from jsonb_to_recordset(p_items) as x(id uuid, name text, price bigint, qty int)
  where id is null or char_length(btrim(coalesce(name, ''))) not between 1 and 60
     or price is null or price <= 0 or qty is null or qty not between 1 and 999
     or price::numeric * qty > 9007199254740991;
  if v_bad > 0 then raise exception 'Each item needs a name, a price above zero and a quantity from 1 to 999'; end if;
  select coalesce(sum(price::numeric * qty), 0) into v_sub from jsonb_to_recordset(p_items) as x(id uuid, name text, price bigint, qty int);
  if v_sub > 9007199254740991 then raise exception 'That bill is too large'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_items) as x(id uuid, name text, price bigint, qty int)
    join public.split_room_items i on i.id = x.id where i.room_id <> p_room_id
  ) then
    raise exception 'An item belongs to another room';
  end if;

  insert into public.split_room_items (id, room_id, name, price, qty, position)
  select x.id, p_room_id, btrim(x.name), x.price, x.qty, t.ord::int
  from jsonb_array_elements(p_items) with ordinality as t(e, ord)
  cross join lateral jsonb_to_record(t.e) as x(id uuid, name text, price bigint, qty int)
  on conflict (id) do update
    set name = excluded.name, price = excluded.price, qty = excluded.qty, position = excluded.position,
        deleted_at = null, updated_at = now()
    where (public.split_room_items.name, public.split_room_items.price, public.split_room_items.qty,
           public.split_room_items.position, public.split_room_items.deleted_at)
          is distinct from (excluded.name, excluded.price, excluded.qty, excluded.position, null);

  update public.split_room_items set deleted_at = now(), updated_at = now()
  where room_id = p_room_id and deleted_at is null
    and id not in (select x.id from jsonb_to_recordset(p_items) as x(id uuid));
  end if;

  if p_charges is not null then
    foreach k in array array['tax', 'service', 'tip'] loop
      if p_charges ? k then
        v_kind := p_charges -> k ->> 'kind';
        v_value := (p_charges -> k ->> 'value')::bigint;
        if v_kind not in ('percent', 'amount') or v_value is null or v_value < 0
           or v_value > 9007199254740991 or (v_kind = 'percent' and v_value > 10000) then
          raise exception 'Tax, service and tip must be a percentage up to 100%% or an amount';
        end if;
        if k = 'tax' then update public.split_rooms set tax_kind = v_kind, tax_value = v_value where id = p_room_id;
        elsif k = 'service' then update public.split_rooms set service_kind = v_kind, service_value = v_value where id = p_room_id;
        else update public.split_rooms set tip_kind = v_kind, tip_value = v_value where id = p_room_id;
        end if;
      end if;
    end loop;
  end if;

  if p_name is not null then
    if char_length(btrim(p_name)) not between 1 and 60 then raise exception 'Give the room a name (up to 60 characters)'; end if;
    update public.split_rooms set name = btrim(p_name) where id = p_room_id;
  end if;

  update public.split_rooms set updated_at = now() where id = p_room_id;
end;
$$;

-- Tap an item: add or remove myself. p_on makes it explicit (safe to retry); null flips.
create or replace function public.toggle_claim(p_item_id uuid, p_on boolean default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.split_rooms := public.room_for_change(public.room_item_room(p_item_id), false);
  v_me uuid := public.my_member_id(v_room.group_id);
  v_cur int;
  v_new int;
begin
  select shares into v_cur from public.split_room_claims where item_id = p_item_id and member_id = v_me;
  v_cur := coalesce(v_cur, 0);
  v_new := case when coalesce(p_on, v_cur = 0) then greatest(v_cur, 1) else 0 end;
  perform public.set_room_claim(v_room, p_item_id, v_me, v_new);
  return v_new;
end;
$$;

-- Long-press: custom shares. Anyone sets their own; the host can set anyone's (ghosts included).
create or replace function public.set_claim_shares(p_item_id uuid, p_shares integer, p_member_id uuid default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.split_rooms := public.room_for_change(public.room_item_room(p_item_id), false);
  v_me uuid := public.my_member_id(v_room.group_id);
  v_member uuid := coalesce(p_member_id, v_me);
begin
  if v_member <> v_me and v_room.host_member <> v_me then
    raise exception 'Only the host can change someone else''s share';
  end if;
  perform public.set_room_claim(v_room, p_item_id, v_member, p_shares);
end;
$$;

-- Host: put someone (usually a ghost) on an item or take them off. p_on null flips.
create or replace function public.assign_claim(p_item_id uuid, p_member_id uuid, p_on boolean default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.split_rooms := public.room_for_change(public.room_item_room(p_item_id), true);
  v_cur int;
  v_new int;
begin
  select shares into v_cur from public.split_room_claims where item_id = p_item_id and member_id = p_member_id;
  v_cur := coalesce(v_cur, 0);
  v_new := case when coalesce(p_on, v_cur = 0) then greatest(v_cur, 1) else 0 end;
  perform public.set_room_claim(v_room, p_item_id, p_member_id, v_new);
  return v_new;
end;
$$;

-- Host: turn the room into one expense (exact splits, one payer), atomically, and close it.
create or replace function public.finalize_room(p_room_id uuid, p_payer uuid default null, p_client_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.split_rooms;
  v_unclaimed int;
  v_items int;
  v_total bigint;
  v_splits jsonb;
  v_payer uuid;
  v_base text;
  v_expense uuid;
begin
  -- Already finalized (e.g. a retry after a dropped response): return the same expense.
  select * into v_room from public.split_rooms where id = p_room_id;
  if v_room.status = 'finalized' and v_room.expense_id is not null and public.is_member(v_room.group_id) then
    return v_room.expense_id;
  end if;

  v_room := public.room_for_change(p_room_id, true);

  select count(*) into v_items from public.split_room_items where room_id = p_room_id and deleted_at is null;
  if v_items = 0 then raise exception 'Add an item first'; end if;
  select count(*) into v_unclaimed from public.split_room_items i
  where i.room_id = p_room_id and i.deleted_at is null
    and not exists (select 1 from public.split_room_claims c where c.item_id = i.id and c.shares > 0);
  if v_unclaimed > 0 then
    raise exception '% % unclaimed', v_unclaimed, case when v_unclaimed = 1 then 'item' else 'items' end;
  end if;

  select coalesce(sum(t.total), 0),
         jsonb_agg(jsonb_build_object('member_id', t.member_id, 'amount', t.total, 'raw_value', t.total) order by t.member_id)
           filter (where t.total > 0)
    into v_total, v_splits
  from public.room_totals(p_room_id) as t;
  if v_total <= 0 then raise exception 'The bill is empty'; end if;

  v_payer := coalesce(p_payer, v_room.host_member);
  select base_currency into v_base from public.groups where id = v_room.group_id;

  -- Same validation as any expense: payer and everyone in the split must be active members,
  -- lines must sum to the total.
  v_expense := public.create_expense(
    v_room.group_id, v_room.name, v_total, v_base, 1, 'food', current_date, null, 'exact',
    jsonb_build_array(jsonb_build_object('member_id', v_payer, 'amount', v_total)), v_splits, p_client_id
  );

  update public.split_rooms
  set status = 'finalized', expense_id = v_expense, paid_by = v_payer, closed_at = now(), updated_at = now()
  where id = p_room_id;

  perform public.log_activity(v_room.group_id, v_room.host_member, 'room_finalized', p_room_id,
    jsonb_build_object('name', v_room.name, 'code', v_room.code, 'expense_id', v_expense,
                       'amount', v_total, 'base_currency', v_base, 'people', jsonb_array_length(v_splits)));
  return v_expense;
end;
$$;

create or replace function public.cancel_room(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_room public.split_rooms;
begin
  select * into v_room from public.split_rooms where id = p_room_id for update;
  if v_room.id is null or not public.is_member(v_room.group_id) then raise exception 'Room not found'; end if;
  if v_room.host_member <> public.my_member_id(v_room.group_id) then raise exception 'Only the host can do that'; end if;
  if v_room.status <> 'open' then raise exception 'This room is already closed'; end if;
  update public.split_rooms set status = 'cancelled', closed_at = now(), updated_at = now() where id = p_room_id;
  perform public.log_activity(v_room.group_id, v_room.host_member, 'room_cancelled', p_room_id,
    jsonb_build_object('name', v_room.name, 'code', v_room.code));
end;
$$;

------------------------------------------------------------------------------------------------
-- Realtime: publication + the private room channel "room:<CODE>"
------------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['split_rooms', 'split_room_items', 'split_room_claims'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- "room:<CODE>" → the room's group id; anything else → null.
create or replace function public.realtime_room_group_id(p_topic text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select case when p_topic ~ '^room:[2-9A-HJ-NP-Z]{6}$'
              then (public.room_by_code(substring(p_topic from 6))).group_id end;
$$;

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'realtime' and tablename = 'messages') then
    drop policy if exists "Group members can listen on their group channel" on realtime.messages;
    create policy "Group members can listen on their group channel"
      on realtime.messages for select to authenticated
      using (public.is_member(coalesce(
        public.realtime_group_id((select realtime.topic())),
        public.realtime_room_group_id((select realtime.topic()))
      )));

    drop policy if exists "Group members can share presence on their group channel" on realtime.messages;
    create policy "Group members can share presence on their group channel"
      on realtime.messages for insert to authenticated
      with check (public.is_member(coalesce(
        public.realtime_group_id((select realtime.topic())),
        public.realtime_room_group_id((select realtime.topic()))
      )));
  end if;
end;
$$;

------------------------------------------------------------------------------------------------
-- Grants
------------------------------------------------------------------------------------------------

revoke execute on function
  public.can_see_room(uuid), public.room_allocate(bigint, bigint[]), public.room_charge(text, bigint, bigint),
  public.room_totals(uuid), public.room_by_code(text), public.room_for_change(uuid, boolean),
  public.room_item_room(uuid), public.set_room_claim(public.split_rooms, uuid, uuid, integer),
  public.create_room(uuid, text), public.room_preview(text), public.join_room(text),
  public.upsert_items(uuid, jsonb, jsonb, text), public.toggle_claim(uuid, boolean),
  public.set_claim_shares(uuid, integer, uuid), public.assign_claim(uuid, uuid, boolean),
  public.finalize_room(uuid, uuid, uuid), public.cancel_room(uuid), public.realtime_room_group_id(text)
from public, anon, authenticated;

-- RLS policies call can_see_room / realtime_room_group_id as the reader.
grant execute on function public.can_see_room(uuid), public.realtime_room_group_id(text) to authenticated;
grant execute on function public.room_preview(text) to anon, authenticated;
grant execute on function
  public.create_room(uuid, text), public.join_room(text),
  public.upsert_items(uuid, jsonb, jsonb, text), public.toggle_claim(uuid, boolean),
  public.set_claim_shares(uuid, integer, uuid), public.assign_claim(uuid, uuid, boolean),
  public.finalize_room(uuid, uuid, uuid), public.cancel_room(uuid)
to authenticated;

notify pgrst, 'reload schema';
