-- Add per-segment script/audio metadata and timing
alter table public.episode_segments
  add column if not exists script text,
  add column if not exists audio_url text,
  add column if not exists start_time_seconds numeric;

create index if not exists idx_episode_segments_start_time on public.episode_segments (episode_id, start_time_seconds);
