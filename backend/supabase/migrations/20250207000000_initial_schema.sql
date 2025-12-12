-- Base schema for API data models
create extension if not exists "pgcrypto";

-- Topics
create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  original_text text not null,
  rewritten_query text,
  order_index integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint topics_unique_user_text unique (user_id, original_text)
);

create index if not exists idx_topics_user_id on public.topics (user_id);
create index if not exists idx_topics_user_active on public.topics (user_id, is_active);
create index if not exists idx_topics_user_order on public.topics (user_id, order_index);

alter table public.topics enable row level security;

drop policy if exists "Users can read own topics" on public.topics;
drop policy if exists "Users can insert own topics" on public.topics;
drop policy if exists "Users can update own topics" on public.topics;

create policy "Users can read own topics" on public.topics
  for select using (auth.uid() = user_id);

create policy "Users can insert own topics" on public.topics
  for insert with check (auth.uid() = user_id);

create policy "Users can update own topics" on public.topics
  for update using (auth.uid() = user_id);

-- Episodes
do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'episode_status') then
    create type episode_status as enum (
      'queued',
      'rewriting_queries',
      'retrieving_content',
      'generating_script',
      'generating_audio',
      'ready',
      'failed'
    );
  end if;
end $$;

create table if not exists public.episodes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text,
  status episode_status not null,
  archived_at timestamptz,
  target_duration_minutes integer not null,
  audio_url text,
  transcript text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_episodes_user on public.episodes (user_id);
create index if not exists idx_episodes_user_status on public.episodes (user_id, status);
create index if not exists idx_episodes_user_not_archived on public.episodes (user_id) where archived_at is null;

alter table public.episodes enable row level security;

drop policy if exists "Users can read own episodes" on public.episodes;
drop policy if exists "Users can insert own episodes" on public.episodes;
drop policy if exists "Users can update own episodes" on public.episodes;

create policy "Users can read own episodes" on public.episodes
  for select using (auth.uid() = user_id);

create policy "Users can insert own episodes" on public.episodes
  for insert with check (auth.uid() = user_id);

create policy "Users can update own episodes" on public.episodes
  for update using (auth.uid() = user_id);

-- Episode segments
create table if not exists public.episode_segments (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  order_index integer not null,
  title text,
  raw_content text not null,
  raw_sources jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_episode_segments_episode on public.episode_segments (episode_id);

alter table public.episode_segments enable row level security;

drop policy if exists "Users can read own episode segments" on public.episode_segments;
drop policy if exists "Users can insert own episode segments" on public.episode_segments;
drop policy if exists "Users can update own episode segments" on public.episode_segments;
drop policy if exists "Users can delete own episode segments" on public.episode_segments;

create policy "Users can read own episode segments" on public.episode_segments
  for select using (exists (
    select 1 from public.episodes e
    where e.id = episode_id and e.user_id = auth.uid()
  ));

create policy "Users can insert own episode segments" on public.episode_segments
  for insert with check (exists (
    select 1 from public.episodes e
    where e.id = episode_id and e.user_id = auth.uid()
  ));

create policy "Users can update own episode segments" on public.episode_segments
  for update using (exists (
    select 1 from public.episodes e
    where e.id = episode_id and e.user_id = auth.uid()
  ));

create policy "Users can delete own episode segments" on public.episode_segments
  for delete using (exists (
    select 1 from public.episodes e
    where e.id = episode_id and e.user_id = auth.uid()
  ));

-- Episode sources
create table if not exists public.episode_sources (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  source_title text not null,
  url text not null,
  type text,
  created_at timestamptz not null default now()
);

create index if not exists idx_episode_sources_episode on public.episode_sources (episode_id);

alter table public.episode_sources enable row level security;

drop policy if exists "Users can read own episode sources" on public.episode_sources;
drop policy if exists "Users can insert own episode sources" on public.episode_sources;
drop policy if exists "Users can update own episode sources" on public.episode_sources;
drop policy if exists "Users can delete own episode sources" on public.episode_sources;

create policy "Users can read own episode sources" on public.episode_sources
  for select using (exists (
    select 1 from public.episodes e
    where e.id = episode_id and e.user_id = auth.uid()
  ));

create policy "Users can insert own episode sources" on public.episode_sources
  for insert with check (exists (
    select 1 from public.episodes e
    where e.id = episode_id and e.user_id = auth.uid()
  ));

create policy "Users can update own episode sources" on public.episode_sources
  for update using (exists (
    select 1 from public.episodes e
    where e.id = episode_id and e.user_id = auth.uid()
  ));

create policy "Users can delete own episode sources" on public.episode_sources
  for delete using (exists (
    select 1 from public.episodes e
    where e.id = episode_id and e.user_id = auth.uid()
  ));
