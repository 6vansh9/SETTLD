-- Phone numbers and phone-based ghost invites. Requires 0001–0009. Safe to re-run.
--
-- • Phone numbers are NOT verified (no SMS OTP), so they never grant access or claim anything.
--   The personal claim link (invites.ghost_member_id) stays the only proof for taking a ghost's spot.
-- • Private: user_phones is readable only by its owner; ghost_phones only by that group's admins.
--   Neither lives on profiles (which co-members can read). All writes go through RPCs.
-- • Format: E.164 (+<country><number>), validated in the app with libphonenumber-js and here by shape.
-- • group_members.added_by remembers who added a ghost, so "Rahul joined Goa Trip" reaches them.

------------------------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------------------------

create table if not exists public.user_phones (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  updated_at timestamptz not null default now()
);

create table if not exists public.ghost_phones (
  member_id uuid primary key references public.group_members (id) on delete cascade,
  group_id uuid not null references public.groups (id) on delete cascade,
  phone text not null check (phone ~ '^\+[1-9][0-9]{6,14}$'),
  updated_at timestamptz not null default now()
);
create index if not exists ghost_phones_group_idx on public.ghost_phones (group_id);

alter table public.group_members add column if not exists added_by uuid references public.group_members (id);

alter table public.user_phones enable row level security;
alter table public.ghost_phones enable row level security;

drop policy if exists "Read my own phone" on public.user_phones;
create policy "Read my own phone" on public.user_phones for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "Admins read their group's ghost phones" on public.ghost_phones;
create policy "Admins read their group's ghost phones" on public.ghost_phones for select to authenticated using (public.is_admin(group_id));

revoke all on public.user_phones, public.ghost_phones from anon;
revoke insert, update, delete on public.user_phones, public.ghost_phones from authenticated;
grant select on public.user_phones, public.ghost_phones to authenticated;

create or replace function public.valid_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := regexp_replace(coalesce(p_phone, ''), '[\s\-()]', '', 'g');
begin
  if v = '' then return null; end if;
  if v !~ '^\+[1-9][0-9]{6,14}$' then raise exception 'Enter the number with its country code, like +91 98765 43210'; end if;
  return v;
end;
$$;

------------------------------------------------------------------------------------------------
-- RPCs
------------------------------------------------------------------------------------------------

-- My phone (null/blank removes it).
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
    delete from public.user_phones where user_id = v_uid;
  else
    insert into public.user_phones (user_id, phone) values (v_uid, v_phone)
    on conflict (user_id) do update set phone = excluded.phone, updated_at = now();
  end if;
end;
$$;

-- Add a ghost, optionally with their phone (admins). Remembers who added them.
drop function if exists public.add_ghost(uuid, text);
create or replace function public.add_ghost(p_group_id uuid, p_name text, p_phone text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := public.clean_name(p_name, 'Name');
  v_phone text := public.valid_phone(p_phone);
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

  insert into public.group_members (group_id, display_name, is_ghost, added_by)
  values (p_group_id, v_name, true, public.my_member_id(p_group_id))
  returning id into v_id;

  if v_phone is not null then
    insert into public.ghost_phones (member_id, group_id, phone) values (v_id, p_group_id, v_phone);
  end if;
  return v_id;
end;
$$;

-- Admins: add, change or remove (null) an unclaimed ghost's phone.
create or replace function public.set_ghost_phone(p_member_id uuid, p_phone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_m public.group_members;
  v_phone text := public.valid_phone(p_phone);
begin
  perform public.require_uid();
  select * into v_m from public.group_members where id = p_member_id;
  if v_m.id is null or not public.is_admin(v_m.group_id) then raise exception 'Only admins can do that'; end if;
  if not v_m.is_ghost or v_m.left_at is not null then raise exception 'That person is no longer waiting to join'; end if;
  if v_phone is null then
    delete from public.ghost_phones where member_id = p_member_id;
  else
    insert into public.ghost_phones (member_id, group_id, phone) values (p_member_id, v_m.group_id, v_phone)
    on conflict (member_id) do update set phone = excluded.phone, updated_at = now();
  end if;
end;
$$;

-- Onboarding prefill: the phone saved on the ghost a *personal claim link* points at. Only for the
-- holder of that live link (signed in, not already in the group). The link is the proof; the phone
-- is just a convenience for typing.
create or replace function public.claim_link_phone(p_token text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_invite public.invites;
  v_phone text;
begin
  select i.* into v_invite from public.invites i join public.groups g on g.id = i.group_id
  where i.token = p_token and i.revoked_at is null and i.ghost_member_id is not null and g.archived_at is null;
  if v_invite.id is null then return null; end if;
  if exists (select 1 from public.group_members where group_id = v_invite.group_id and user_id = v_uid and left_at is null) then
    return null;
  end if;
  select gp.phone into v_phone from public.ghost_phones gp
  join public.group_members m on m.id = gp.member_id
  where gp.member_id = v_invite.ghost_member_id and m.is_ghost and m.left_at is null;
  return v_phone;
end;
$$;

------------------------------------------------------------------------------------------------
-- Claiming: drop the ghost's phone (it was the inviter's note, not the new member's data) and tell
-- whoever added them. Same as 0006's take_ghost_slot plus added_by in the activity payload.
------------------------------------------------------------------------------------------------

create or replace function public.take_ghost_slot(p_member_id uuid, p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_group uuid;
  v_ghost_name text;
  v_added_by uuid;
begin
  select group_id, display_name, added_by into v_group, v_ghost_name, v_added_by from public.group_members where id = p_member_id;
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

  delete from public.ghost_phones where member_id = p_member_id;

  perform public.log_activity(v_group, p_member_id, 'ghost_claimed', p_member_id,
    jsonb_build_object('ghost_name', v_ghost_name, 'added_by', v_added_by));
end;
$$;

revoke execute on function public.take_ghost_slot(uuid, uuid) from public, anon, authenticated;

-- Push for ghost_claimed too (0009's trigger function, one more kind).
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
  if new.kind not in ('expense_created', 'settlement_recorded', 'settlement_confirmed', 'settlement_disputed', 'comment_added', 'nudge_sent', 'ghost_claimed') then
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
    raise warning 'push webhook failed: %', sqlerrm;
  end;
  return new;
end;
$$;
revoke execute on function public.notify_push_on_activity() from public, anon, authenticated;

------------------------------------------------------------------------------------------------
-- Grants
------------------------------------------------------------------------------------------------

revoke execute on function
  public.valid_phone(text), public.set_my_phone(text), public.add_ghost(uuid, text, text),
  public.set_ghost_phone(uuid, text), public.claim_link_phone(text)
from public, anon, authenticated;

grant execute on function
  public.set_my_phone(text), public.add_ghost(uuid, text, text), public.set_ghost_phone(uuid, text), public.claim_link_phone(text)
to authenticated;

notify pgrst, 'reload schema';
