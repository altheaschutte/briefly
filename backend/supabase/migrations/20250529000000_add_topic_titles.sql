-- Add generated titles for topics (2–3 word summaries)

alter table public.topics
  add column if not exists title text;

-- Backfill a simple title for existing topics (first 3 cleaned words).
update public.topics
set title = array_to_string(
  (regexp_split_to_array(
    regexp_replace(coalesce(original_text, ''), '[^[:alnum:][:space:]''’\\-]', '', 'g'),
    '\\s+'
  ))[1:3],
  ' '
)
where (title is null or btrim(title) = '')
  and coalesce(original_text, '') <> '';

-- Ensure seed topics created at signup also get a title.
create or replace function public.seed_topics_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  seed_topics text[] := array[
    'Update me on renewables outpacing fossils in investments and new capacity worldwide.',
    'Share conservation wins with species rebounding from the brink this year.',
    'Tell me about the High Seas Treaty entering force and protecting ocean biodiversity.',
    'Highlight gene therapy breakthroughs treating rare ''untreatable'' diseases in 2025.',
    'Explore mind-bending consciousness theories like panpsychism gaining traction.',
    'Reveal hopeful 2025 environmental stories, like the smallest ozone hole in decades.',
    'Dive into CRISPR advances creating ''living drugs'' for genetic conditions.',
    'Alert me to the golden age of species discovery with thousands found annually.',
    'Share surprising long-term drops in violent crime and heart disease deaths.',
    'Uncover weird philosophy like solipsism or how biases shape our grasp of reality.'
  ];
  active_choices int[];
  idx int;
  computed_title text;
begin
  -- Avoid reseeding if the user already has topics
  if exists (select 1 from public.topics where user_id = new.id) then
    return new;
  end if;

  active_choices := array(
    select gs
    from generate_series(1, array_length(seed_topics, 1)) as gs
    order by random()
    limit 3
  );

  for idx in 1..array_length(seed_topics, 1) loop
    computed_title := array_to_string(
      (regexp_split_to_array(
        regexp_replace(coalesce(seed_topics[idx], ''), '[^[:alnum:][:space:]''’\\-]', '', 'g'),
        '\\s+'
      ))[1:3],
      ' '
    );

    insert into public.topics (user_id, original_text, title, order_index, is_active, is_seed)
    values (
      new.id,
      seed_topics[idx],
      nullif(btrim(computed_title), ''),
      idx - 1,
      idx = any(active_choices),
      true
    );
  end loop;

  return new;
end;
$$;

