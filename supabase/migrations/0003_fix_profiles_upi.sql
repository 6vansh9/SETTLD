-- Patch: bring an existing public.profiles table in line with 0001_profiles.sql.
-- Safe to run any number of times. Never drops the table or any data you'd want to keep.
--
-- Fixes the 400 on saving a UPI ID: the old check used {2,256}, but Postgres regexes cap
-- repetition counts at 255, so every non-null upi_id raised 2201B "invalid repetition count(s)".

-- 1. Columns that might be missing on an older table.
alter table public.profiles add column if not exists name text not null default '';
alter table public.profiles add column if not exists avatar_color text not null default 'lilac';
alter table public.profiles add column if not exists upi_id text;
alter table public.profiles add column if not exists default_currency text not null default 'INR';
alter table public.profiles add column if not exists privacy_blur boolean not null default false;
alter table public.profiles add column if not exists onboarded_at timestamptz;
alter table public.profiles add column if not exists created_at timestamptz not null default now();
alter table public.profiles add column if not exists updated_at timestamptz not null default now();

-- 2. Drop the old checks on these columns, whatever they're named, before touching data:
--    with the broken UPI check in place, any UPDATE of a row with a UPI ID would fail too.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.profiles'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ~ '(upi_id|avatar_color|default_currency|char_length\(name\))'
  loop
    execute format('alter table public.profiles drop constraint %I', c.conname);
  end loop;
end;
$$;

-- 3. Clean values the constraints below would reject (only invalid data changes).
--    Old constraint blocked every non-null UPI ID, so in practice this only clears blanks.
update public.profiles set upi_id = nullif(btrim(upi_id), '') where upi_id is distinct from nullif(btrim(upi_id), '');
update public.profiles set upi_id = null
  where upi_id is not null and upi_id !~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9]{1,63}$';
update public.profiles set name = left(name, 40) where char_length(name) > 40;
update public.profiles set avatar_color = 'lilac'
  where avatar_color not in ('pink', 'sky', 'mint', 'butter', 'lilac', 'peach');
update public.profiles set default_currency = 'INR'
  where default_currency not in ('INR', 'USD', 'AUD', 'EUR', 'GBP');

-- 4. Add the checks back (same names and definitions as 0001_profiles.sql).
alter table public.profiles add constraint profiles_upi_id_check
  check (upi_id is null or upi_id ~ '^[A-Za-z0-9._-]{2,255}@[A-Za-z][A-Za-z0-9]{1,63}$');

alter table public.profiles add constraint profiles_name_check check (char_length(name) <= 40);

alter table public.profiles add constraint profiles_avatar_color_check
  check (avatar_color in ('pink', 'sky', 'mint', 'butter', 'lilac', 'peach'));

alter table public.profiles add constraint profiles_default_currency_check
  check (default_currency in ('INR', 'USD', 'AUD', 'EUR', 'GBP'));

-- 5. Blank UPI IDs are stored as null, whoever writes them.
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

revoke execute on function public.normalize_profile_upi() from public, anon, authenticated;

drop trigger if exists profiles_normalize_upi on public.profiles;
create trigger profiles_normalize_upi
  before insert or update of upi_id on public.profiles
  for each row execute function public.normalize_profile_upi();

-- 6. Make the API notice any new columns right away.
notify pgrst, 'reload schema';
