-- Add title column to episode_sources for clearer display, keep source_title for backward compatibility
alter table public.episode_sources
  add column if not exists title text;

-- Backfill title from source_title where missing
update public.episode_sources
set title = coalesce(title, source_title)
where (title is null or btrim(title) = '') and source_title is not null;

-- Add plan reference to episodes to tie to stored producer plans
alter table public.episodes
  add column if not exists plan_id uuid references public.episode_plans(id) on delete set null;

-- Remove legacy script_prompt; transcript now holds full script text
alter table public.episodes
  drop column if exists script_prompt;

-- Ensure transcript column exists for full script text
alter table public.episodes
  add column if not exists transcript text;

-- Segment typing for intro/body/outro and required script storage
alter table public.episode_segments
  add column if not exists segment_type text;

-- Backfill segment_type to 'body' where missing
update public.episode_segments
set segment_type = coalesce(nullif(segment_type, ''), 'body');

-- Ensure script column exists
alter table public.episode_segments
  add column if not exists script text;
