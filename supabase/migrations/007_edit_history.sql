create extension if not exists pgcrypto;

create table if not exists public.edit_history (
  id uuid default gen_random_uuid() primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  instruction text not null,
  edit_type text not null,
  files_changed text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.edit_history enable row level security;

drop policy if exists "Users can view own edit history" on public.edit_history;
create policy "Users can view own edit history"
  on public.edit_history for select
  using (
    exists (
      select 1
      from public.projects p
      where p.id = edit_history.project_id
        and p.user_id = auth.uid()
    )
  );

drop policy if exists "Service role can manage edit history" on public.edit_history;
create policy "Service role can manage edit history"
  on public.edit_history for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create index if not exists idx_edit_history_project_created_at
  on public.edit_history(project_id, created_at desc);
