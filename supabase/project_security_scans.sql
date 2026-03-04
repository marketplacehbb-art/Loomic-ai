-- Optional persistence table for project security scan history.
-- Apply this migration in your Supabase project to retain scan results across server restarts.

create table if not exists public.project_security_scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  environment text not null check (environment in ('test', 'live')),
  scanned_at timestamptz not null default now(),
  score integer not null check (score >= 0 and score <= 100),
  findings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists project_security_scans_user_id_idx on public.project_security_scans (user_id);
create index if not exists project_security_scans_project_id_idx on public.project_security_scans (project_id);
create index if not exists project_security_scans_scanned_at_idx on public.project_security_scans (scanned_at desc);

alter table public.project_security_scans enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_security_scans'
      and policyname = 'project_security_scans_owner_select'
  ) then
    create policy project_security_scans_owner_select
      on public.project_security_scans
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_security_scans'
      and policyname = 'project_security_scans_owner_mutation'
  ) then
    create policy project_security_scans_owner_mutation
      on public.project_security_scans
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;
