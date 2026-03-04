-- ==========================================
-- SUPABASE AUTH TRIGOER SETUP
-- ==========================================
-- Run this entire script in the Supabase SQL Editor
-- to ensure users are automatically created in the
-- public.users table when they sign up.

-- 1. Create the function that handles user creation
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, username, created_at)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'username',
    new.created_at
  );
  return new;
end;
$$;

-- 2. Create the trigger that calls the function
-- This will run AFTER a new row is inserted into auth.users
create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Optional: If you already have users in auth.users that are missing in public.users,
-- you can run this ONCE to backfill them:
-- insert into public.users (id, email, created_at)
-- select id, email, created_at from auth.users
-- where id not in (select id from public.users);
