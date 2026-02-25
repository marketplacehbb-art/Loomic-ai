-- 0. Ensure profiles table exists (Fix for "relation does not exist" error)
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique,
  full_name text,
  avatar_url text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS on profiles if just created
alter table public.profiles enable row level security;

-- Basic Profile Policies (if not exist)
create policy "Users can view own profile" 
  on public.profiles for select 
  using (auth.uid() = id);

create policy "Users can update own profile" 
  on public.profiles for update 
  using (auth.uid() = id);

-- 1. Add roles to profiles
do $$
begin
    if not exists (select 1 from pg_type where typname = 'user_role') then
        create type public.user_role as enum ('admin', 'editor', 'viewer');
    end if;
end$$;

alter table public.profiles 
add column if not exists role public.user_role default 'editor'::public.user_role;

-- 2. Create Audit Logs Table
create table if not exists public.audit_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_id uuid,
  details jsonb default '{}'::jsonb,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Enable RLS on Audit Logs
alter table public.audit_logs enable row level security;

-- 4. Audit Log Policies
-- Drop existing policies to avoid conflicts during re-run
drop policy if exists "Admins can view all audit logs" on public.audit_logs;
drop policy if exists "Users can view their own audit logs" on public.audit_logs;
drop policy if exists "Users can insert audit logs" on public.audit_logs;

create policy "Admins can view all audit logs"
  on public.audit_logs for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Users can view their own audit logs"
  on public.audit_logs for select
  using ( auth.uid() = user_id );

create policy "Users can insert audit logs"
  on public.audit_logs for insert
  with check ( auth.uid() = user_id );

-- 5. Indexes
create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);
create index if not exists idx_audit_logs_action on public.audit_logs(action);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);

-- 6. Admin Override Policies (Drop first to avoid errors)
drop policy if exists "Admins can view all projects" on public.projects;
drop policy if exists "Admins can update all projects" on public.projects;
drop policy if exists "Admins can delete all projects" on public.projects;

create policy "Admins can view all projects"
  on public.projects for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can update all projects"
  on public.projects for update
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

create policy "Admins can delete all projects"
  on public.projects for delete
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );
