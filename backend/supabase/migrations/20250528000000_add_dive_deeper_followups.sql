-- Dive Deeper follow-up episodes (segment-seeded)

-- Episode status: insert new stage for seed generation
do $$
begin
  if exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace where n.nspname = 'public' and t.typname = 'episode_status') then
    if not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = 'public'
        and t.typname = 'episode_status'
        and e.enumlabel = 'generating_dive_deeper_seeds'
    ) then
      alter type public.episode_status add value 'generating_dive_deeper_seeds';
    end if;
  end if;
end $$;

-- Segment dive-deeper seeds (one per episode segment)
create table if not exists public.segment_dive_deeper_seeds (
  id uuid primary key default gen_random_uuid(),
  episode_id uuid not null references public.episodes(id) on delete cascade,
  segment_id uuid not null references public.episode_segments(id) on delete cascade,
  position integer,
  title text not null,
  angle text not null,
  focus_claims jsonb not null default '[]'::jsonb,
  seed_queries jsonb not null default '[]'::jsonb,
  context_bundle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint segment_dive_deeper_seeds_unique_segment unique (segment_id)
);

create index if not exists idx_segment_dive_deeper_seeds_episode on public.segment_dive_deeper_seeds (episode_id);
create index if not exists idx_segment_dive_deeper_seeds_segment on public.segment_dive_deeper_seeds (segment_id);

alter table public.segment_dive_deeper_seeds enable row level security;

drop policy if exists "Users can read own segment dive deeper seeds" on public.segment_dive_deeper_seeds;
drop policy if exists "Users can insert own segment dive deeper seeds" on public.segment_dive_deeper_seeds;
drop policy if exists "Users can update own segment dive deeper seeds" on public.segment_dive_deeper_seeds;
drop policy if exists "Users can delete own segment dive deeper seeds" on public.segment_dive_deeper_seeds;

create policy "Users can read own segment dive deeper seeds" on public.segment_dive_deeper_seeds
  for select using (exists (
    select 1 from public.episodes e
    where e.id = episode_id and e.user_id = auth.uid()
  ));

create policy "Users can insert own segment dive deeper seeds" on public.segment_dive_deeper_seeds
  for insert with check (exists (
    select 1 from public.episodes e
    where e.id = episode_id and e.user_id = auth.uid()
  ));

create policy "Users can update own segment dive deeper seeds" on public.segment_dive_deeper_seeds
  for update using (exists (
    select 1 from public.episodes e
    where e.id = episode_id and e.user_id = auth.uid()
  ));

create policy "Users can delete own segment dive deeper seeds" on public.segment_dive_deeper_seeds
  for delete using (exists (
    select 1 from public.episodes e
    where e.id = episode_id and e.user_id = auth.uid()
  ));

-- Topics: allow system-generated "dive deeper" topics without polluting user topic list
alter table public.topics
  add column if not exists segment_dive_deeper_seed_id uuid references public.segment_dive_deeper_seeds(id) on delete cascade,
  add column if not exists context_bundle jsonb;

create index if not exists idx_topics_user_dive_deeper_seed on public.topics (user_id, segment_dive_deeper_seed_id);

-- Replace "unique per user + topic text" with a partial unique index that only applies to user-visible topics.
alter table public.topics drop constraint if exists topics_unique_user_text;
drop index if exists public.topics_unique_user_text;

create unique index if not exists topics_unique_user_text_visible
  on public.topics (user_id, original_text)
  where segment_dive_deeper_seed_id is null;

create unique index if not exists topics_unique_user_dive_deeper_seed
  on public.topics (user_id, segment_dive_deeper_seed_id)
  where segment_dive_deeper_seed_id is not null;

-- Episodes: lineage for follow-up episodes
alter table public.episodes
  add column if not exists parent_episode_id uuid references public.episodes(id) on delete set null,
  add column if not exists parent_segment_id uuid references public.episode_segments(id) on delete set null,
  add column if not exists dive_deeper_seed_id uuid references public.segment_dive_deeper_seeds(id) on delete set null;

create index if not exists idx_episodes_parent_episode on public.episodes (parent_episode_id);
create index if not exists idx_episodes_dive_deeper_seed on public.episodes (dive_deeper_seed_id);

