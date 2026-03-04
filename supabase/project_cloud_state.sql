-- Optional persistence table for project-level cloud workspace state.
-- Apply this migration in Supabase to persist cloud activation across restarts.

create table if not exists public.project_cloud_state (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  enabled boolean not null default false,
  enabled_at timestamptz,
  last_action_source text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, project_id)
);

create index if not exists project_cloud_state_user_id_idx on public.project_cloud_state (user_id);
create index if not exists project_cloud_state_project_id_idx on public.project_cloud_state (project_id);

alter table public.project_cloud_state enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_cloud_state'
      and policyname = 'project_cloud_state_owner_select'
  ) then
    create policy project_cloud_state_owner_select
      on public.project_cloud_state
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
      and tablename = 'project_cloud_state'
      and policyname = 'project_cloud_state_owner_mutation'
  ) then
    create policy project_cloud_state_owner_mutation
      on public.project_cloud_state
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.update_project_cloud_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_project_cloud_state_updated_at on public.project_cloud_state;
create trigger trg_project_cloud_state_updated_at
before update on public.project_cloud_state
for each row
execute function public.update_project_cloud_state_updated_at();
