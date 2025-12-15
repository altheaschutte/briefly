-- Link episode sources to specific segments
alter table public.episode_sources
  add column if not exists segment_id uuid;

-- Ensure episode-source linkage aligns with the owning segment
alter table public.episode_sources
  drop constraint if exists episode_sources_segment_id_fkey;

create unique index if not exists idx_episode_segments_id_episode on public.episode_segments (id, episode_id);

alter table public.episode_sources
  add constraint episode_sources_segment_episode_fk
  foreign key (segment_id, episode_id)
  references public.episode_segments(id, episode_id)
  on delete cascade;

create index if not exists idx_episode_sources_segment on public.episode_sources (segment_id);
