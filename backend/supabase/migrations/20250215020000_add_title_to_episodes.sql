-- Add episode title storage
alter table public.episodes
  add column if not exists title text;
