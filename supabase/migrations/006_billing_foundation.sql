-- Billing foundation columns on profiles
alter table public.profiles add column if not exists plan text default 'free';
alter table public.profiles add column if not exists credits_used integer default 0;
alter table public.profiles add column if not exists credits_total integer default 5;
alter table public.profiles add column if not exists credits_reset_at timestamptz;
alter table public.profiles add column if not exists stripe_customer_id text;
alter table public.profiles add column if not exists stripe_subscription_id text;
alter table public.profiles add column if not exists subscription_status text default 'active';

-- Generation usage tracking
create extension if not exists pgcrypto;

create table if not exists public.generations (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id),
  project_id uuid,
  tokens_used integer default 0,
  provider text,
  prompt_preview text,
  pipeline text,
  latency_ms integer,
  created_at timestamptz default now()
);

alter table public.generations enable row level security;

drop policy if exists "Users can view own generations" on public.generations;
create policy "Users can view own generations"
  on public.generations for select
  using (auth.uid() = user_id);

drop policy if exists "Service role can manage generations" on public.generations;
create policy "Service role can manage generations"
  on public.generations for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create index if not exists idx_generations_user_created_at on public.generations(user_id, created_at desc);
create index if not exists idx_generations_project_created_at on public.generations(project_id, created_at desc);
