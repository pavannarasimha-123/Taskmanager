-- Run this once in Supabase: Dashboard > SQL Editor > New query
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  text text not null,
  completed boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.tasks enable row level security;

create policy "select own tasks" on public.tasks
  for select using (auth.uid() = user_id);
create policy "insert own tasks" on public.tasks
  for insert with check (auth.uid() = user_id);
create policy "update own tasks" on public.tasks
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own tasks" on public.tasks
  for delete using (auth.uid() = user_id);
