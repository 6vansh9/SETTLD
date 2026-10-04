-- Milestone 2: profiles (PRD.md › Data model)
-- One row per auth user, created by a trigger on sign-up.
-- onboarded_at is not in the PRD table; added (approved) to know when onboarding is finished.
--
-- Safe to re-run: every statement is idempotent, and the backfill at the end creates
-- profiles for auth users who signed up before this file was first run.
-- An existing table keeps its old checks (create table if not exists); 0003 updates those.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default ''
    constraint profiles_name_check check (char_length(name) <= 40),
  avatar_color text not null default 'lilac'
    constraint profiles_avatar_color_check
    check (avatar_color in ('pink', 'sky', 'mint', 'butter', 'lilac', 'peach')),
  -- Same pattern as UPI_ID_PATTERN in lib/upi.ts. Postgres caps regex repeats at 255.
  upi_id text
    constraint profiles_upi_id_check
    check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9]{1,63}$'),
  default_currency text not null default 'INR'
    constraint profiles_default_currency_check
    check (default_currency in ('INR', 'USD', 'AUD', 'EUR', 'GBP')),
  privacy_blur boolean not null default false,
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Read own row. 0002_groups.sql replaces this with "profiles in shared groups";
-- don't re-add it if that replacement already exists.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'Users can read profiles in shared groups'
  ) then
    drop policy if exists "Users can read their own profile" on public.profiles;
    create policy "Users can read their own profile"
      on public.profiles for select
      to authenticated
      using (id = (select auth.uid()));
  end if;
end;
$$;

-- Lets the app create a missing profile on the fly (lib/auth.ts), only for yourself.
drop policy if exists "Users can create their own profile" on public.profiles;
create policy "Users can create their own profile"
  on public.profiles for insert
  to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- No delete policy: rows are removed with the auth user.

-- Keep updated_at fresh.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Blank UPI IDs are stored as null, whoever writes them.
create or replace function public.normalize_profile_upi()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.upi_id = nullif(btrim(new.upi_id), '');
  return new;
end;
$$;

drop trigger if exists profiles_normalize_upi on public.profiles;
create trigger profiles_normalize_upi
  before insert or update of upi_id on public.profiles
  for each row execute function public.normalize_profile_upi();

-- Default display name: Google name, else the email's local part. Mirrors lib/profile-defaults.ts.
create or replace function public.default_profile_name(p_meta jsonb, p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    btrim(coalesce(
      nullif(btrim(p_meta ->> 'full_name'), ''),
      nullif(btrim(p_meta ->> 'name'), ''),
      split_part(coalesce(p_email, ''), '@', 1)
    )),
    40
  );
$$;

-- First sign-in creates the profile.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, public.default_profile_name(new.raw_user_meta_data, new.email))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Trigger-only / internal functions should not be callable through the API.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.default_profile_name(jsonb, text) from public, anon, authenticated;
revoke execute on function public.normalize_profile_upi() from public, anon, authenticated;

-- Backfill: profiles for anyone who signed up before this ran. Existing rows are untouched.
insert into public.profiles (id, name)
select u.id, public.default_profile_name(u.raw_user_meta_data, u.email)
from auth.users u
on conflict (id) do nothing;
