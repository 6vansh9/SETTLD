-- Milestone 8: personality (PRD.md › Personality features). Requires 0001–0008. Safe to re-run.
--
-- • reactions: one per member per expense/settlement; emoji null = removed (never hard-deleted, so
--   Realtime can deliver un-reacts filtered by group).
-- • comments: plain text ≤ 280, soft delete by the author only; each comment logs activity.
-- • entity_seen: when I last opened an item (the "new" dot on cards).
-- • nudges: escalating levels within 14 days, one per sender → receiver per 24 h (enforced here).
-- • push_subscriptions: Web Push endpoints per user (written only through RPCs, read by the server).
-- • group_members.notify_level (all / money / off) and groups.nudge_mode (on / polite / off).
-- • A trigger posts every activity insert to the app's push route through pg_net, with a shared
--   secret. URL and secret live in private.app_settings (filled in outside git).

------------------------------------------------------------------------------------------------
-- Settings columns
------------------------------------------------------------------------------------------------

alter table public.group_members add column if not exists notify_level text not null default 'all';
alter table public.group_members drop constraint if exists group_members_notify_level_check;
alter table public.group_members add constraint group_members_notify_level_check check (notify_level in ('all', 'money', 'off'));

alter table public.groups add column if not exists nudge_mode text not null default 'on';
alter table public.groups drop constraint if exists groups_nudge_mode_check;
alter table public.groups add constraint groups_nudge_mode_check check (nudge_mode in ('on', 'polite', 'off'));

------------------------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------------------------

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  entity_type text not null check (entity_type in ('expense', 'settlement')),
  entity_id uuid not null,
  member_id uuid not null references public.group_members (id),
  emoji text check (emoji is null or emoji in ('💀', '😭', '🔥', '🙏', '🤡', '💸')),
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id, member_id)
);
create index if not exists reactions_group_idx on public.reactions (group_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  entity_type text not null check (entity_type in ('expense', 'settlement')),
  entity_id uuid not null,
  member_id uuid not null references public.group_members (id),
  body text not null check (char_length(body) between 1 and 280),
  client_id uuid unique,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists comments_group_idx on public.comments (group_id, created_at);

create table if not exists public.entity_seen (
  member_id uuid not null references public.group_members (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  entity_type text not null check (entity_type in ('expense', 'settlement')),
  entity_id uuid not null,
  seen_at timestamptz not null default now(),
  primary key (member_id, entity_type, entity_id)
);

create table if not exists public.nudges (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  from_member uuid not null references public.group_members (id),
  to_member uuid not null references public.group_members (id),
  level integer not null check (level between 1 and 3),
  amount bigint not null check (amount > 0),
  days integer not null check (days >= 0),
  template integer not null check (template between 0 and 99),
  sent_at timestamptz not null default now(),
  constraint nudges_not_self check (from_member <> to_member)
);
create index if not exists nudges_pair_idx on public.nudges (from_member, to_member, sent_at desc);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

------------------------------------------------------------------------------------------------
-- RLS: members read their groups' rows; all writes through RPCs
------------------------------------------------------------------------------------------------

alter table public.reactions enable row level security;
alter table public.comments enable row level security;
alter table public.entity_seen enable row level security;
alter table public.nudges enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "Members read reactions" on public.reactions;
create policy "Members read reactions" on public.reactions for select to authenticated using (public.is_member(group_id));
drop policy if exists "Members read comments" on public.comments;
create policy "Members read comments" on public.comments for select to authenticated using (public.is_member(group_id));
drop policy if exists "Members read nudges" on public.nudges;
create policy "Members read nudges" on public.nudges for select to authenticated using (public.is_member(group_id));
drop policy if exists "Read my seen marks" on public.entity_seen;
create policy "Read my seen marks" on public.entity_seen for select to authenticated
  using (member_id in (select id from public.group_members where user_id = (select auth.uid())));
drop policy if exists "Read my push subscriptions" on public.push_subscriptions;
create policy "Read my push subscriptions" on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.reactions, public.comments, public.entity_seen, public.nudges, public.push_subscriptions from anon;
revoke insert, update, delete on public.reactions, public.comments, public.entity_seen, public.nudges, public.push_subscriptions from authenticated;
grant select on public.reactions, public.comments, public.entity_seen, public.nudges, public.push_subscriptions to authenticated;

------------------------------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------------------------------

-- The group of a live (not deleted) expense/settlement the caller can see; raises otherwise.
create or replace function public.social_entity_group(p_type text, p_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_group uuid;
begin
  if p_type = 'expense' then
    select group_id into v_group from public.expenses where id = p_id and deleted_at is null;
  elsif p_type = 'settlement' then
    select group_id into v_group from public.settlements where id = p_id and deleted_at is null;
  else
    raise exception 'Unknown item type';
  end if;
  if v_group is null or not public.is_member(v_group) then raise exception 'That item is gone'; end if;
  return v_group;
end;
$$;

------------------------------------------------------------------------------------------------
-- Reactions, comments, seen
------------------------------------------------------------------------------------------------

-- Tap an emoji: set it; tap the same one again: remove (emoji null). Returns my emoji now.
create or replace function public.toggle_reaction(p_entity_type text, p_entity_id uuid, p_emoji text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := public.social_entity_group(p_entity_type, p_entity_id);
  v_me uuid := public.my_member_id(v_group);
  v_cur text;
  v_new text;
begin
  if p_emoji is null or p_emoji not in ('💀', '😭', '🔥', '🙏', '🤡', '💸') then raise exception 'Pick one of the six reactions'; end if;
  select emoji into v_cur from public.reactions where entity_type = p_entity_type and entity_id = p_entity_id and member_id = v_me;
  v_new := case when v_cur is not distinct from p_emoji then null else p_emoji end;
  insert into public.reactions (group_id, entity_type, entity_id, member_id, emoji)
  values (v_group, p_entity_type, p_entity_id, v_me, v_new)
  on conflict (entity_type, entity_id, member_id) do update set emoji = excluded.emoji, updated_at = now();
  return v_new;
end;
$$;

create or replace function public.add_comment(p_entity_type text, p_entity_id uuid, p_body text, p_client_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := public.social_entity_group(p_entity_type, p_entity_id);
  v_me uuid := public.my_member_id(v_group);
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_title text;
begin
  perform public.assert_group_writable(v_group);
  if p_client_id is not null then
    select id into v_id from public.comments where client_id = p_client_id and member_id = v_me;
    if v_id is not null then return v_id; end if;
  end if;
  if char_length(v_body) = 0 then raise exception 'Write something first'; end if;
  if char_length(v_body) > 280 then raise exception 'Keep it under 280 characters'; end if;

  insert into public.comments (group_id, entity_type, entity_id, member_id, body, client_id)
  values (v_group, p_entity_type, p_entity_id, v_me, v_body, p_client_id)
  returning id into v_id;

  if p_entity_type = 'expense' then
    select title into v_title from public.expenses where id = p_entity_id;
  end if;
  perform public.log_activity(v_group, v_me, 'comment_added', v_id,
    jsonb_build_object('entity_type', p_entity_type, 'entity_id', p_entity_id, 'title', v_title, 'body', left(v_body, 120)));
  return v_id;
end;
$$;

-- Only the author can delete (soft) their comment.
create or replace function public.delete_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_c public.comments;
begin
  select * into v_c from public.comments where id = p_comment_id and deleted_at is null;
  if v_c.id is null or not public.is_member(v_c.group_id) then raise exception 'That comment is gone'; end if;
  if v_c.member_id <> public.my_member_id(v_c.group_id) then raise exception 'You can only delete your own comments'; end if;
  update public.comments set deleted_at = now() where id = p_comment_id;
end;
$$;

create or replace function public.mark_seen(p_entity_type text, p_entity_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid := public.social_entity_group(p_entity_type, p_entity_id);
  v_me uuid := public.my_member_id(v_group);
begin
  insert into public.entity_seen (member_id, group_id, entity_type, entity_id, seen_at)
  values (v_me, v_group, p_entity_type, p_entity_id, now())
  on conflict (member_id, entity_type, entity_id) do update set seen_at = now();
end;
$$;

------------------------------------------------------------------------------------------------
-- Settings
------------------------------------------------------------------------------------------------

create or replace function public.set_notify_level(p_group_id uuid, p_level text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_level not in ('all', 'money', 'off') then raise exception 'Unknown notification setting'; end if;
  update public.group_members set notify_level = p_level where id = public.my_member_id(p_group_id);
end;
$$;

create or replace function public.set_nudge_mode(p_group_id uuid, p_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_mode not in ('on', 'polite', 'off') then raise exception 'Unknown nudge setting'; end if;
  if not public.is_admin(p_group_id) then raise exception 'Only group admins can change nudges'; end if;
  perform public.assert_group_writable(p_group_id);
  update public.groups set nudge_mode = p_mode, updated_at = now() where id = p_group_id;
end;
$$;

------------------------------------------------------------------------------------------------
-- Nudges
------------------------------------------------------------------------------------------------

-- Nudge someone who owes me. The client sends the amount it shows on the row; the server checks
-- they really owe me at least that (by net balances), picks the level, and enforces 24 h.
create or replace function public.send_nudge(p_to_member uuid, p_amount bigint, p_template integer)
returns public.nudges
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_to public.group_members;
  v_group public.groups;
  v_me uuid;
  v_my_net bigint;
  v_their_net bigint;
  v_last timestamptz;
  v_recent integer;
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

  -- One at a time per pair, so two quick taps can't both pass the 24 h check.
  perform pg_advisory_xact_lock(hashtextextended(v_me::text || '>' || p_to_member::text, 0));

  select coalesce(net, 0) into v_my_net from public.group_balances where member_id = v_me;
  select coalesce(net, 0) into v_their_net from public.group_balances where member_id = p_to_member;
  if coalesce(v_their_net, 0) >= 0 or coalesce(v_my_net, 0) <= 0 then raise exception 'They don''t owe you anything right now'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > least(-v_their_net, v_my_net) then raise exception 'That amount doesn''t match what they owe'; end if;

  select max(sent_at) into v_last from public.nudges where from_member = v_me and to_member = p_to_member;
  if v_last is not null and v_last > now() - interval '24 hours' then
    raise exception 'You can nudge them again at %', to_char((v_last + interval '24 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  select count(*) into v_recent from public.nudges
  where from_member = v_me and to_member = p_to_member and sent_at > now() - interval '14 days';
  v_level := case when v_group.nudge_mode = 'polite' then 1 else least(3, v_recent + 1) end;

  -- Days it's been owed: since the oldest live expense I paid that they share, after their last
  -- payment to me (whichever is later).
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

------------------------------------------------------------------------------------------------
-- Push subscriptions
------------------------------------------------------------------------------------------------

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
begin
  -- An endpoint belongs to one browser: if someone else signed in on it before, it moves to me.
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_uid, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = v_uid, p256dh = excluded.p256dh, auth = excluded.auth, user_agent = excluded.user_agent, created_at = now();
end;
$$;

create or replace function public.delete_push_subscription(p_endpoint text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = (select auth.uid());
$$;

------------------------------------------------------------------------------------------------
-- Activity → push route (pg_net), with a shared secret from private.app_settings
------------------------------------------------------------------------------------------------

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table if not exists private.app_settings (key text primary key, value text not null);
revoke all on private.app_settings from public, anon, authenticated;

do $$
begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  raise notice 'pg_net not available here (%): push trigger will be inert', sqlerrm;
end;
$$;

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
  if new.kind not in ('expense_created', 'settlement_recorded', 'settlement_confirmed', 'settlement_disputed', 'comment_added', 'nudge_sent') then
    return new;
  end if;
  select value into v_url from private.app_settings where key = 'push_webhook_url';
  select value into v_secret from private.app_settings where key = 'push_webhook_secret';
  if v_url is null or v_secret is null then return new; end if;
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

drop trigger if exists activity_push on public.activity;
create trigger activity_push after insert on public.activity
  for each row execute function public.notify_push_on_activity();

------------------------------------------------------------------------------------------------
-- Realtime
------------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['reactions', 'comments', 'nudges'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

------------------------------------------------------------------------------------------------
-- Grants
------------------------------------------------------------------------------------------------

revoke execute on function
  public.social_entity_group(text, uuid), public.notify_push_on_activity(),
  public.toggle_reaction(text, uuid, text), public.add_comment(text, uuid, text, uuid), public.delete_comment(uuid),
  public.mark_seen(text, uuid), public.set_notify_level(uuid, text), public.set_nudge_mode(uuid, text),
  public.send_nudge(uuid, bigint, integer), public.save_push_subscription(text, text, text, text),
  public.delete_push_subscription(text)
from public, anon, authenticated;

grant execute on function
  public.toggle_reaction(text, uuid, text), public.add_comment(text, uuid, text, uuid), public.delete_comment(uuid),
  public.mark_seen(text, uuid), public.set_notify_level(uuid, text), public.set_nudge_mode(uuid, text),
  public.send_nudge(uuid, bigint, integer), public.save_push_subscription(text, text, text, text),
  public.delete_push_subscription(text)
to authenticated;

notify pgrst, 'reload schema';
