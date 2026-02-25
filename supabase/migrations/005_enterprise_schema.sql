-- 1. Add roles to profiles
create type public.user_role as enum ('admin', 'editor', 'viewer');

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

-- Audit Log Policies
-- Admins can view all logs
create policy "Admins can view all audit logs"
  on public.audit_logs for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'admin'
    )
  );

-- Users can view their own logs
create policy "Users can view their own audit logs"
  on public.audit_logs for select
  using ( auth.uid() = user_id );

-- System/Server can insert logs (Authenticated users can trigger actions that log)
create policy "Users can insert audit logs"
  on public.audit_logs for insert
  with check ( auth.uid() = user_id );

-- NO UPDATE/DELETE policies = Immutable Logs

-- 4. Create Indexes
create index if not exists idx_audit_logs_user_id on public.audit_logs(user_id);
create index if not exists idx_audit_logs_action on public.audit_logs(action);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);

-- 5. Update Projects RLS for Roles (Example for Admin Override)
-- Note: Existing policies handle 'owner' access. We add Admin override here.
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
