-- Add timezone to existing profiles table and introduce scheduling tables

alter table public.profiles
  add column if not exists timezone text not null default 'Australia/Brisbane';

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'schedule_frequency') then
    create type schedule_frequency as enum (
      'daily',
      'every_2_days',
      'every_3_days',
      'every_4_days',
      'every_5_days',
      'every_6_days',
      'weekly'
    );
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'schedule_run_status') then
    create type schedule_run_status as enum ('queued', 'success', 'skipped', 'failed');
  end if;
end $$;

create table if not exists public.episode_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  frequency schedule_frequency not null default 'daily',
  local_time_minutes integer not null check (local_time_minutes >= 0 and local_time_minutes < 24 * 60),
  timezone text not null,
  is_active boolean not null default true,
  next_run_at timestamptz,
  last_run_at timestamptz,
  last_status schedule_run_status,
  last_error text,
  target_duration_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_episode_schedules_user on public.episode_schedules (user_id);
create index if not exists idx_episode_schedules_next_run on public.episode_schedules (next_run_at) where is_active = true;

alter table public.episode_schedules enable row level security;

drop policy if exists "Users can read own schedules" on public.episode_schedules;
drop policy if exists "Users can insert own schedules" on public.episode_schedules;
drop policy if exists "Users can update own schedules" on public.episode_schedules;
drop policy if exists "Users can delete own schedules" on public.episode_schedules;

create policy "Users can read own schedules" on public.episode_schedules
  for select using (auth.uid() = user_id);

create policy "Users can insert own schedules" on public.episode_schedules
  for insert with check (auth.uid() = user_id);

create policy "Users can update own schedules" on public.episode_schedules
  for update using (auth.uid() = user_id);

create policy "Users can delete own schedules" on public.episode_schedules
  for delete using (auth.uid() = user_id);

create table if not exists public.schedule_runs (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.episode_schedules(id) on delete cascade,
  user_id uuid not null,
  run_at timestamptz not null default now(),
  status schedule_run_status not null,
  message text,
  episode_id uuid,
  duration_seconds numeric,
  created_at timestamptz not null default now()
);

create index if not exists idx_schedule_runs_schedule on public.schedule_runs (schedule_id, run_at desc);
create index if not exists idx_schedule_runs_user on public.schedule_runs (user_id, run_at desc);

alter table public.schedule_runs enable row level security;

drop policy if exists "Users can read own schedule runs" on public.schedule_runs;
drop policy if exists "Users can insert own schedule runs" on public.schedule_runs;

create policy "Users can read own schedule runs" on public.schedule_runs
  for select using (auth.uid() = user_id);

create policy "Users can insert own schedule runs" on public.schedule_runs
  for insert with check (auth.uid() = user_id);
