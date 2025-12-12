-- Store generated cover artwork and prompt
alter table public.episodes
  add column if not exists cover_image_url text,
  add column if not exists cover_prompt text;
