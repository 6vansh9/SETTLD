-- Milestone 6: realtime layer (PRD.md › Realtime architecture). Requires 0001–0005. Safe to re-run.
--
-- What each client receives:
--   • postgres_changes: Supabase Realtime checks the subscriber's RLS SELECT policy for every row
--     (is_member(group_id) on all of these tables), so you only get changes from your groups.
--     Money writes are soft (UPDATE deleted_at), so they're RLS-checked too. Hard DELETEs (only
--     expense_payers/splits being rewritten) carry primary keys only (opaque UUIDs, no amounts);
--     the app doesn't subscribe to those two tables, it refetches lines with their expense.
--   • Presence/broadcast: the app uses a *private* channel "group:<uuid>"; the policies on
--     realtime.messages below only let current members of that group join it.

------------------------------------------------------------------------------------------------
-- Publication
------------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['expenses', 'expense_payers', 'expense_splits', 'settlements', 'activity', 'group_members'] loop
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
-- Realtime Authorization for the private group channel (presence)
------------------------------------------------------------------------------------------------

-- "group:<uuid>" → uuid; anything else → null (so is_member(null) is false, never an error).
create or replace function public.realtime_group_id(p_topic text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_topic ~ '^group:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then substring(p_topic from 7)::uuid
  end;
$$;

revoke execute on function public.realtime_group_id(text) from public, anon;
grant execute on function public.realtime_group_id(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_tables where schemaname = 'realtime' and tablename = 'messages') then
    drop policy if exists "Group members can listen on their group channel" on realtime.messages;
    create policy "Group members can listen on their group channel"
      on realtime.messages for select to authenticated
      using (public.is_member(public.realtime_group_id((select realtime.topic()))));

    drop policy if exists "Group members can share presence on their group channel" on realtime.messages;
    create policy "Group members can share presence on their group channel"
      on realtime.messages for insert to authenticated
      with check (public.is_member(public.realtime_group_id((select realtime.topic()))));
  end if;
end;
$$;

------------------------------------------------------------------------------------------------
-- Activity: keep the ghost's name when a spot is claimed ("Zoya was claimed by Priya").
-- Same as 0004's take_ghost_slot, plus the ghost name in the activity payload.
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
begin
  select group_id, display_name into v_group, v_ghost_name from public.group_members where id = p_member_id;
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

  perform public.log_activity(v_group, p_member_id, 'ghost_claimed', p_member_id,
    jsonb_build_object('ghost_name', v_ghost_name));
end;
$$;

revoke execute on function public.take_ghost_slot(uuid, uuid) from public, anon, authenticated;
