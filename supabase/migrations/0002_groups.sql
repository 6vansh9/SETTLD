-- Milestone 3: groups, members (incl. ghosts), invites (PRD.md › Data model, Row-level security)
-- Requires 0001_profiles.sql. Every multi-table write goes through a security-definer RPC below.

create extension if not exists pgcrypto with schema extensions;

------------------------------------------------------------------------------------------------
-- Tables
------------------------------------------------------------------------------------------------

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  emoji text not null default '💸' check (char_length(emoji) between 1 and 16),
  color text not null default 'pink'
    check (color in ('pink', 'sky', 'mint', 'butter', 'lilac', 'peach')),
  base_currency text not null default 'INR'
    check (base_currency in ('INR', 'USD', 'AUD', 'EUR', 'GBP')),
  type text not null default 'other' check (type in ('trip', 'home', 'couple', 'other')),
  simplify boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute function public.set_updated_at();

-- Ghosts have user_id null; claiming sets it and flips is_ghost.
create table public.group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  is_ghost boolean not null default false,
  role text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  constraint group_members_ghost_has_no_user check (is_ghost = (user_id is null)),
  constraint group_members_one_row_per_user unique (group_id, user_id)
);

create index group_members_user_id_idx on public.group_members (user_id);

-- ghost_member_id set = personal claim link for that ghost.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  token text not null unique check (char_length(token) >= 12),
  created_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  ghost_member_id uuid references public.group_members (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index invites_group_id_idx on public.invites (group_id);
-- One live group link per group, and one live claim link per ghost.
create unique index invites_one_active_group_link
  on public.invites (group_id) where revoked_at is null and ghost_member_id is null;
create unique index invites_one_active_claim_link
  on public.invites (ghost_member_id) where revoked_at is null and ghost_member_id is not null;

------------------------------------------------------------------------------------------------
-- Helpers (security definer so RLS policies can call them without recursion)
------------------------------------------------------------------------------------------------

create function public.is_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = (select auth.uid())
  );
$$;

create function public.is_admin(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = (select auth.uid()) and role = 'admin'
  );
$$;

create function public.shares_group(p_user_id uuid)
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
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user_id
  );
$$;

-- 12 random bytes → 16 URL-safe characters.
create function public.new_invite_token()
returns text
language sql
volatile
set search_path = ''
as $$
  select translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/', '-_');
$$;

------------------------------------------------------------------------------------------------
-- Row-level security
------------------------------------------------------------------------------------------------

alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.invites enable row level security;

create policy "Members can read their groups"
  on public.groups for select to authenticated
  using (public.is_member(id));

create policy "Members can read fellow members"
  on public.group_members for select to authenticated
  using (public.is_member(group_id));

-- Any member can share the group link; personal ghost claim links are admin-only.
create policy "Members can read group links, admins claim links"
  on public.invites for select to authenticated
  using (
    public.is_member(group_id)
    and (ghost_member_id is null or public.is_admin(group_id))
  );

-- No insert/update/delete policies: all writes go through the functions below.

-- Profiles: readable by anyone you share a group with (replaces the M2 own-row policy).
drop policy "Users can read their own profile" on public.profiles;
create policy "Users can read profiles in shared groups"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_group(id));

------------------------------------------------------------------------------------------------
-- RPCs
------------------------------------------------------------------------------------------------

create function public.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  return v_uid;
end;
$$;

create function public.clean_name(p_name text, p_what text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v text := btrim(coalesce(p_name, ''));
begin
  if char_length(v) = 0 then
    raise exception '% can''t be empty', p_what;
  end if;
  if char_length(v) > 40 then
    raise exception '% is too long (40 characters max)', p_what;
  end if;
  return v;
end;
$$;

create function public.profile_name(p_uid uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(nullif(btrim(name), ''), 'Member') from public.profiles where id = p_uid;
$$;

-- Create a group; the creator becomes admin and a share link is created.
create function public.create_group(
  p_name text,
  p_emoji text,
  p_color text,
  p_base_currency text,
  p_type text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_group_id uuid;
begin
  insert into public.groups (name, emoji, color, base_currency, type, created_by)
  values (public.clean_name(p_name, 'Group name'), btrim(p_emoji), p_color, p_base_currency, p_type, v_uid)
  returning id into v_group_id;

  insert into public.group_members (group_id, user_id, display_name, role)
  values (v_group_id, v_uid, public.profile_name(v_uid), 'admin');

  insert into public.invites (group_id, token, created_by)
  values (v_group_id, public.new_invite_token(), v_uid);

  return v_group_id;
end;
$$;

-- Public preview for /join/<token> and link unfurls: only name, emoji, color, member count.
create function public.preview_invite(p_token text)
returns table (name text, emoji text, color text, member_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select g.name, g.emoji, g.color,
         (select count(*) from public.group_members m where m.group_id = g.id)::integer
  from public.invites i
  join public.groups g on g.id = i.group_id
  where i.token = p_token and i.revoked_at is null and g.archived_at is null;
$$;

-- Signed-in details for the Join screen: am I already in, which ghosts can I claim,
-- and is this a personal claim link.
create function public.invite_details(p_token text)
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

  if exists (select 1 from public.group_members where group_id = v_invite.group_id and user_id = v_uid) then
    return jsonb_build_object('member_group_id', v_invite.group_id, 'ghosts', '[]'::jsonb, 'claim', null);
  end if;

  if v_invite.ghost_member_id is not null then
    select * into v_claim from public.group_members
    where id = v_invite.ghost_member_id and is_ghost;
  end if;

  return jsonb_build_object(
    'member_group_id', null,
    'ghosts', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'display_name', m.display_name) order by m.joined_at)
      from public.group_members m
      where m.group_id = v_invite.group_id and m.is_ghost
    ), '[]'::jsonb),
    'claim', case when v_claim.id is null then null
                  else jsonb_build_object('id', v_claim.id, 'display_name', v_claim.display_name) end
  );
end;
$$;

-- Shared by join_group and claim_ghost: turn a ghost into the caller.
create function public.take_ghost_slot(p_member_id uuid, p_uid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.group_members
  set user_id = p_uid, is_ghost = false, display_name = public.profile_name(p_uid)
  where id = p_member_id and is_ghost and user_id is null;

  if not found then
    raise exception 'That spot was already claimed';
  end if;

  -- The ghost's personal claim link has done its job.
  update public.invites set revoked_at = now()
  where ghost_member_id = p_member_id and revoked_at is null;
end;
$$;

-- Join via a link. A personal claim link auto-claims its ghost. Idempotent for existing members.
create function public.join_group(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_invite public.invites;
  v_archived timestamptz;
begin
  select * into v_invite from public.invites where token = p_token and revoked_at is null;
  if v_invite.id is null then
    raise exception 'This invite link is no longer valid';
  end if;
  select archived_at into v_archived from public.groups where id = v_invite.group_id;
  if v_archived is not null then
    raise exception 'This group is archived';
  end if;

  if exists (select 1 from public.group_members where group_id = v_invite.group_id and user_id = v_uid) then
    return v_invite.group_id;
  end if;

  if v_invite.ghost_member_id is not null then
    perform public.take_ghost_slot(v_invite.ghost_member_id, v_uid);
  else
    insert into public.group_members (group_id, user_id, display_name)
    values (v_invite.group_id, v_uid, public.profile_name(v_uid));
  end if;

  return v_invite.group_id;
end;
$$;

-- "That's me": join by taking over an unclaimed ghost. The token proves you were invited.
create function public.claim_ghost(p_token text, p_member_id uuid)
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

  select group_id into v_member_group from public.group_members where id = p_member_id;
  if v_member_group is distinct from v_invite.group_id then
    raise exception 'That person isn''t in this group';
  end if;

  if exists (select 1 from public.group_members where group_id = v_invite.group_id and user_id = v_uid) then
    raise exception 'You''re already in this group';
  end if;

  perform public.take_ghost_slot(p_member_id, v_uid);
  return v_invite.group_id;
end;
$$;

-- Admin: kill the current share link and issue a new one.
create function public.regenerate_invite(p_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_token text := public.new_invite_token();
begin
  if not public.is_admin(p_group_id) then
    raise exception 'Only admins can reset the invite link';
  end if;

  update public.invites set revoked_at = now()
  where group_id = p_group_id and ghost_member_id is null and revoked_at is null;

  insert into public.invites (group_id, token, created_by) values (p_group_id, v_token, v_uid);
  return v_token;
end;
$$;

-- Admin: personal claim link for a ghost (reuses the live one if it exists).
create function public.ghost_claim_link(p_member_id uuid)
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
  if not v_member.is_ghost then
    raise exception 'That person has already joined';
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

-- Admin: add someone by name before they have an account.
create function public.add_ghost(p_group_id uuid, p_name text)
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
  if exists (select 1 from public.groups where id = p_group_id and archived_at is not null) then
    raise exception 'This group is archived';
  end if;
  select display_name into v_existing from public.group_members
  where group_id = p_group_id and lower(display_name) = lower(v_name)
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

-- Admin: remove a member or ghost. (Zero-balance check arrives with expenses in Milestone 4.)
create function public.remove_member(p_member_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public.require_uid();
  v_member public.group_members;
begin
  select * into v_member from public.group_members where id = p_member_id;
  if v_member.id is null or not public.is_admin(v_member.group_id) then
    raise exception 'Only admins can remove people';
  end if;
  if v_member.user_id = v_uid then
    raise exception 'You can''t remove yourself';
  end if;
  if exists (select 1 from public.groups where id = v_member.group_id and archived_at is not null) then
    raise exception 'This group is archived';
  end if;

  delete from public.group_members where id = p_member_id;
end;
$$;

-- Admin: rename, change emoji or color.
create function public.update_group(p_group_id uuid, p_name text, p_emoji text, p_color text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_uid();
  if not public.is_admin(p_group_id) then
    raise exception 'Only admins can edit the group';
  end if;
  if exists (select 1 from public.groups where id = p_group_id and archived_at is not null) then
    raise exception 'Unarchive the group to edit it';
  end if;

  update public.groups
  set name = public.clean_name(p_name, 'Group name'), emoji = btrim(p_emoji), color = p_color
  where id = p_group_id;
end;
$$;

-- Admin: archive (read-only) or unarchive.
create function public.set_group_archived(p_group_id uuid, p_archived boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_uid();
  if not public.is_admin(p_group_id) then
    raise exception 'Only admins can archive the group';
  end if;

  update public.groups
  set archived_at = case when p_archived then coalesce(archived_at, now()) else null end
  where id = p_group_id;
end;
$$;

-- Keep members' display names in step with profile renames.
create function public.sync_member_names()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.name is distinct from old.name and btrim(new.name) <> '' then
    update public.group_members set display_name = left(btrim(new.name), 40) where user_id = new.id;
  end if;
  return new;
end;
$$;

create trigger profiles_sync_member_names
  after update of name on public.profiles
  for each row execute function public.sync_member_names();

------------------------------------------------------------------------------------------------
-- Grants: functions are executable by PUBLIC by default; lock them down.
------------------------------------------------------------------------------------------------

revoke execute on function
  public.is_member(uuid), public.is_admin(uuid), public.shares_group(uuid),
  public.new_invite_token(), public.require_uid(), public.clean_name(text, text),
  public.profile_name(uuid), public.take_ghost_slot(uuid, uuid), public.sync_member_names(),
  public.create_group(text, text, text, text, text), public.preview_invite(text),
  public.invite_details(text), public.join_group(text), public.claim_ghost(text, uuid),
  public.regenerate_invite(uuid), public.ghost_claim_link(uuid), public.add_ghost(uuid, text),
  public.remove_member(uuid), public.update_group(uuid, text, text, text),
  public.set_group_archived(uuid, boolean)
from public, anon;

-- RLS helpers are evaluated as the querying role.
grant execute on function public.is_member(uuid), public.is_admin(uuid), public.shares_group(uuid)
to authenticated;

grant execute on function
  public.create_group(text, text, text, text, text), public.invite_details(text),
  public.join_group(text), public.claim_ghost(text, uuid), public.regenerate_invite(uuid),
  public.ghost_claim_link(uuid), public.add_ghost(uuid, text), public.remove_member(uuid),
  public.update_group(uuid, text, text, text), public.set_group_archived(uuid, boolean)
to authenticated;

-- Link previews (WhatsApp, iMessage) fetch /join/<token> signed out.
grant execute on function public.preview_invite(text) to anon, authenticated;

-- Internal helpers stay callable from inside the security-definer functions (owner = postgres)
-- but not over the API.
revoke execute on function
  public.new_invite_token(), public.require_uid(), public.clean_name(text, text),
  public.profile_name(uuid), public.take_ghost_slot(uuid, uuid)
from authenticated;
