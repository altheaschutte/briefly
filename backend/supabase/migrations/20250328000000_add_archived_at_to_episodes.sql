alter table public.episodes
add column if not exists archived_at timestamptz;

create index if not exists idx_episodes_user_not_archived
on public.episodes (user_id)
where archived_at is null;
