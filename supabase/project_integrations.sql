-- Optional persistence table for project-level Supabase OAuth integrations.
-- Apply this migration in your Supabase project to persist connect state across server restarts.

create table if not exists public.project_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  provider text not null default 'supabase',
  environment text not null check (environment in ('test', 'live')),
  status text not null default 'disconnected' check (status in ('connected', 'disconnected')),
  connected_at timestamptz,
  disconnected_at timestamptz,
  project_ref text,
  scopes text[] default '{}',
  token_expires_at timestamptz,
  access_token text,
  refresh_token text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, provider, environment)
);

create index if not exists project_integrations_user_id_idx on public.project_integrations (user_id);
create index if not exists project_integrations_project_id_idx on public.project_integrations (project_id);
create index if not exists project_integrations_status_idx on public.project_integrations (status);

alter table public.project_integrations enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_integrations'
      and policyname = 'project_integrations_owner_select'
  ) then
    create policy project_integrations_owner_select
      on public.project_integrations
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
      and tablename = 'project_integrations'
      and policyname = 'project_integrations_owner_mutation'
  ) then
    create policy project_integrations_owner_mutation
      on public.project_integrations
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.update_project_integrations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_project_integrations_updated_at on public.project_integrations;
create trigger trg_project_integrations_updated_at
before update on public.project_integrations
for each row
execute function public.update_project_integrations_updated_at();

