-- Store the full prompt used for script generation
alter table public.episodes
  add column if not exists script_prompt text;
