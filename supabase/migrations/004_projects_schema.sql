-- ==========================================
-- PROJECTS TABLE SCHEMA & RLS
-- ==========================================

-- 1. Create Table
create table if not exists public.projects (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  code text not null, -- The main code content (e.g. App.tsx)
  prompt text, -- The prompt used to generate it
  template varchar(50) default 'react-basic', -- e.g. 'react-basic', 'landing-page'
  
  -- Metadata
  status text check (status in ('draft', 'published', 'archived')) default 'draft',
  is_public boolean default false,
  views integer default 0,
  tags text[],
  
  -- Assets
  thumbnail_url text, -- URL to storage
  thumbnail text, -- Base64 or alternative path (legacy/backup)
  
  -- History
  prompt_history jsonb default '[]'::jsonb,
  
  -- Timestamps
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  deleted_at timestamp with time zone
);

-- 2. Enable RLS
alter table public.projects enable row level security;

-- 3. Policies

-- SELECT: Users can see their own projects OR public projects
create policy "Users can view their own projects"
  on public.projects for select
  using ( auth.uid() = user_id );

create policy "Anyone can view public projects"
  on public.projects for select
  using ( is_public = true );

-- INSERT: Authenticated users can create projects
create policy "Users can create their own projects"
  on public.projects for insert
  with check ( auth.uid() = user_id );

-- UPDATE: Users can update their own projects
create policy "Users can update their own projects"
  on public.projects for update
  using ( auth.uid() = user_id );

-- DELETE: Users can delete their own projects
create policy "Users can delete their own projects"
  on public.projects for delete
  using ( auth.uid() = user_id );

-- 4. Indexes for Performance
create index if not exists idx_projects_user_id on public.projects(user_id);
create index if not exists idx_projects_is_public on public.projects(is_public);
create index if not exists idx_projects_updated_at on public.projects(updated_at desc);
create index if not exists idx_projects_user_updated on public.projects(user_id, updated_at desc);

-- 5. Trigger for updated_at (Optional but good practice)
-- (Assuming handle_updated_at function exists, otherwise create it)
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger on_projects_updated
  before update on public.projects
  for each row execute procedure public.handle_updated_at();
