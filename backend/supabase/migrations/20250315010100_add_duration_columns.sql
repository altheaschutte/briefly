-- Track generated audio durations for episodes and segments
alter table public.episodes
  add column if not exists duration_seconds numeric;

alter table public.episode_segments
  add column if not exists duration_seconds numeric;
