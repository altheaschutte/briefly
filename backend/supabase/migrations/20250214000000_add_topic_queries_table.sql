-- Support multiple search queries per topic and episode
alter table public.topics drop column if exists rewritten_query;

create table if not exists public.topic_queries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  topic_id uuid not null references public.topics(id) on delete cascade,
  episode_id uuid not null references public.episodes(id) on delete cascade,
  query text not null,
  answer text,
  citations jsonb not null default '[]'::jsonb,
  order_index integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_topic_queries_user on public.topic_queries (user_id);
create index if not exists idx_topic_queries_topic on public.topic_queries (topic_id);
create index if not exists idx_topic_queries_episode on public.topic_queries (episode_id);
create index if not exists idx_topic_queries_user_topic_episode on public.topic_queries (user_id, topic_id, episode_id);

alter table public.topic_queries enable row level security;

drop policy if exists "Users can read own topic queries" on public.topic_queries;
drop policy if exists "Users can insert own topic queries" on public.topic_queries;
drop policy if exists "Users can update own topic queries" on public.topic_queries;
drop policy if exists "Users can delete own topic queries" on public.topic_queries;

create policy "Users can read own topic queries" on public.topic_queries
  for select using (auth.uid() = user_id);

create policy "Users can insert own topic queries" on public.topic_queries
  for insert with check (auth.uid() = user_id);

create policy "Users can update own topic queries" on public.topic_queries
  for update using (auth.uid() = user_id);

create policy "Users can delete own topic queries" on public.topic_queries
  for delete using (auth.uid() = user_id);
