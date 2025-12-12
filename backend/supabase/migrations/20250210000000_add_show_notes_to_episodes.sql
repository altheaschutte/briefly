-- Store show notes / description in markdown for each episode
alter table public.episodes
  add column if not exists show_notes text;
