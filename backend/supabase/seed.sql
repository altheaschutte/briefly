-- Seed data for local/remote environments
-- Adjust the user ID and topic texts as needed before running `supabase db seed`.

with vars as (
  select 'e60978d0-98fc-4177-851d-58f5db55d0ff'::uuid as test_user_id
)
insert into public.topics (id, user_id, original_text, rewritten_query, is_active, created_at, updated_at)
select
  gen_random_uuid(),
  vars.test_user_id,
  seed.original_text,
  null,
  true,
  now(),
  now()
from vars,
(
  values
    ('Find art exhibitions or workshops coming up on the Sunshine Coast'),
    ('Tell a brief summary of important global news as 1-2 sentence bullet points- around 5 points'),
    ('Find and share an interesting story in history from the 1900s'),
    ('Teach me a simple Portuguese phrase')
) as seed(original_text)
on conflict (user_id, original_text) do update
set is_active = excluded.is_active,
    updated_at = excluded.updated_at;

-- Add more seed data below (episodes, segments, sources) as needed.
