-- Seed data for local/remote environments
-- Adjust the user ID and topic texts as needed before running `supabase db seed`.

with vars as (
  select 'e60978d0-98fc-4177-851d-58f5db55d0ff'::uuid as test_user_id
)
insert into public.topics (id, user_id, title, original_text, order_index, is_active, is_seed, created_at, updated_at)
select
  gen_random_uuid(),
  vars.test_user_id,
  nullif(
    btrim(
      array_to_string(
        (regexp_split_to_array(
          regexp_replace(coalesce(seed.original_text, ''), '[^[:alnum:][:space:]''’\\-]', '', 'g'),
          '\\s+'
        ))[1:3],
        ' '
      )
    ),
    ''
  ),
  seed.original_text,
  seed.order_index,
  true,
  true,
  now(),
  now()
from vars,
(
  values
    ('Find art exhibitions or workshops coming up on the Sunshine Coast', 0),
    ('Tell a brief summary of important global news as 1-2 sentence bullet points- around 5 points', 1),
    ('Find and share an interesting story in history from the 1900s', 2),
    ('Teach me a simple Portuguese phrase', 3)
) as seed(original_text, order_index)
on conflict (user_id, original_text) do update
set is_active = excluded.is_active,
    updated_at = excluded.updated_at,
    order_index = excluded.order_index;

-- Add more seed data below (episodes, segments, sources) as needed.
