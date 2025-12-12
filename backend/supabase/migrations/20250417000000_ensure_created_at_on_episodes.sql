-- Ensure episodes have a created_at column populated for ordering/display
alter table public.episodes
  add column if not exists created_at timestamptz;

-- Backfill any missing created_at values using the best available timestamp
update public.episodes
set created_at = coalesce(created_at, updated_at, now())
where created_at is null;

-- Enforce defaults and not-null constraint for new/updated rows
alter table public.episodes
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists idx_episodes_user_created_at
  on public.episodes (user_id, created_at desc);
