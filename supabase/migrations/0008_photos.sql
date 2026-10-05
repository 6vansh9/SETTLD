-- Profile photos and group backgrounds. Requires 0001–0007. Safe to re-run.
--
-- • Two public Storage buckets, "avatars" and "group-covers" (2 MB max, WebP/JPEG only). Files are
--   read by public URL (random UUID file names); writes are locked down by storage RLS:
--     avatars/<user id>/<uuid>.webp        only that user can upload, replace or delete
--     group-covers/<group id>/<uuid>.webp  only that group's admins can
-- • profiles.avatar_url / groups.cover_url hold the public URL. Check constraints only accept URLs
--   into our own bucket, in the row's own folder, so nobody can point at an arbitrary image.
-- • groups and profiles join the realtime publication so new photos appear live (RLS still decides
--   who receives which rows).

------------------------------------------------------------------------------------------------
-- Columns
------------------------------------------------------------------------------------------------

alter table public.profiles add column if not exists avatar_url text;
alter table public.groups add column if not exists cover_url text;

alter table public.profiles drop constraint if exists profiles_avatar_url_ours;
alter table public.profiles add constraint profiles_avatar_url_ours check (
  avatar_url is null or (
    char_length(avatar_url) <= 500
    and avatar_url ~ ('^https?://[^/]+/storage/v1/object/public/avatars/' || id::text || '/[0-9a-f-]{36}\.(webp|jpg)$')
  )
);

alter table public.groups drop constraint if exists groups_cover_url_ours;
alter table public.groups add constraint groups_cover_url_ours check (
  cover_url is null or (
    char_length(cover_url) <= 500
    and cover_url ~ ('^https?://[^/]+/storage/v1/object/public/group-covers/' || id::text || '/[0-9a-f-]{36}\.(webp|jpg)$')
  )
);

------------------------------------------------------------------------------------------------
-- Group cover (admins only; groups have no direct update policy)
------------------------------------------------------------------------------------------------

create or replace function public.set_group_cover(p_group_id uuid, p_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_uid();
  if not public.is_admin(p_group_id) then raise exception 'Only group admins can change the background'; end if;
  perform public.assert_group_writable(p_group_id);
  update public.groups set cover_url = nullif(btrim(coalesce(p_url, '')), ''), updated_at = now() where id = p_group_id;
end;
$$;

revoke execute on function public.set_group_cover(uuid, text) from public, anon;
grant execute on function public.set_group_cover(uuid, text) to authenticated;

-- The invite preview (link cards, OG image) now includes the cover.
drop function if exists public.preview_invite(text);
create function public.preview_invite(p_token text)
returns table (name text, emoji text, color text, member_count integer, cover_url text)
language sql
stable
security definer
set search_path = ''
as $$
  select g.name, g.emoji, g.color,
         (select count(*) from public.group_members m where m.group_id = g.id and m.left_at is null)::integer,
         g.cover_url
  from public.invites i
  join public.groups g on g.id = i.group_id
  where i.token = p_token and i.revoked_at is null and g.archived_at is null;
$$;
revoke execute on function public.preview_invite(text) from public;
grant execute on function public.preview_invite(text) to anon, authenticated;

------------------------------------------------------------------------------------------------
-- Storage: buckets + RLS on storage.objects
------------------------------------------------------------------------------------------------

-- "<uuid>/<uuid>.webp|jpg" → the folder uuid; anything else → null (so checks fail, never error).
create or replace function public.photo_folder(p_name text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f-]{36}\.(webp|jpg)$'
              then split_part(p_name, '/', 1)::uuid end;
$$;
grant execute on function public.photo_folder(text) to authenticated;

do $$
begin
  if not exists (select 1 from pg_namespace where nspname = 'storage') then
    raise notice 'No storage schema: skipping buckets and storage policies';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('avatars', 'avatars', true, 2097152, array['image/webp', 'image/jpeg']),
         ('group-covers', 'group-covers', true, 2097152, array['image/webp', 'image/jpeg'])
  on conflict (id) do update
    set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  -- Avatars: your own folder only.
  drop policy if exists "Avatars: upload your own" on storage.objects;
  create policy "Avatars: upload your own" on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and public.photo_folder(name) = (select auth.uid()));
  drop policy if exists "Avatars: see your own files" on storage.objects;
  create policy "Avatars: see your own files" on storage.objects for select to authenticated
    using (bucket_id = 'avatars' and public.photo_folder(name) = (select auth.uid()));
  drop policy if exists "Avatars: replace your own" on storage.objects;
  create policy "Avatars: replace your own" on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and public.photo_folder(name) = (select auth.uid()))
    with check (bucket_id = 'avatars' and public.photo_folder(name) = (select auth.uid()));
  drop policy if exists "Avatars: delete your own" on storage.objects;
  create policy "Avatars: delete your own" on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and public.photo_folder(name) = (select auth.uid()));

  -- Group covers: admins of that group only.
  drop policy if exists "Covers: admins upload" on storage.objects;
  create policy "Covers: admins upload" on storage.objects for insert to authenticated
    with check (bucket_id = 'group-covers' and public.is_admin(public.photo_folder(name)));
  drop policy if exists "Covers: admins see files" on storage.objects;
  create policy "Covers: admins see files" on storage.objects for select to authenticated
    using (bucket_id = 'group-covers' and public.is_admin(public.photo_folder(name)));
  drop policy if exists "Covers: admins replace" on storage.objects;
  create policy "Covers: admins replace" on storage.objects for update to authenticated
    using (bucket_id = 'group-covers' and public.is_admin(public.photo_folder(name)))
    with check (bucket_id = 'group-covers' and public.is_admin(public.photo_folder(name)));
  drop policy if exists "Covers: admins delete" on storage.objects;
  create policy "Covers: admins delete" on storage.objects for delete to authenticated
    using (bucket_id = 'group-covers' and public.is_admin(public.photo_folder(name)));
end;
$$;

------------------------------------------------------------------------------------------------
-- Realtime: photos appear live
------------------------------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach t in array array['groups', 'profiles'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

notify pgrst, 'reload schema';
