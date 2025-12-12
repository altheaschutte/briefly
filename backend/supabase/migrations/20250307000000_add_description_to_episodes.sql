-- Short, human-friendly episode description for lists
alter table public.episodes
  add column if not exists description text;
