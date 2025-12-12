-- Track finalized episode runtime in seconds
alter table public.episodes
  add column if not exists duration_seconds integer;
