-- AI Context Rules (Long Term Memory)
create table if not exists ai_context_rules (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade, 
  category text not null, -- 'style', 'preference', 'tech', 'global'
  content text not null,
  is_active boolean default true,
  weight int default 5,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Project Iterations (Short Term Memory / Learning)
create table if not exists project_iterations (
  id uuid default uuid_generate_v4() primary key,
  project_id uuid references projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  prompt text not null,
  code_snippet text, -- optional, maybe too big to store everything
  user_feedback int, -- 1-5 rating
  correction_notes text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- RLS Policies
alter table ai_context_rules enable row level security;
alter table project_iterations enable row level security;

-- Policies for ai_context_rules
create policy "Users can view their own rules"
  on ai_context_rules for select
  using (auth.uid() = user_id);

create policy "Users can insert their own rules"
  on ai_context_rules for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own rules"
  on ai_context_rules for update
  using (auth.uid() = user_id);

create policy "Users can delete their own rules"
  on ai_context_rules for delete
  using (auth.uid() = user_id);

-- Policies for project_iterations
create policy "Users can view their own iterations"
  on project_iterations for select
  using (auth.uid() = user_id);

create policy "Users can insert their own iterations"
  on project_iterations for insert
  with check (auth.uid() = user_id);

-- Indexes for performance
create index if not exists ai_context_rules_user_idx on ai_context_rules(user_id);
create index if not exists project_iterations_project_idx on project_iterations(project_id);
