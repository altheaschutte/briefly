-- Add is_seed flag for topics and seed defaults for new users
alter table public.topics
  add column if not exists is_seed boolean not null default false;

create index if not exists idx_topics_user_seed on public.topics (user_id, is_seed);

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
    insert into public.topics (user_id, original_text, order_index, is_active, is_seed)
    values (
      new.id,
      seed_topics[idx],
      idx - 1,
      idx = any(active_choices),
      true
    );
  end loop;

  return new;
end;
$$;

drop trigger if exists seed_topics_on_user_created on auth.users;
create trigger seed_topics_on_user_created
after insert on auth.users
for each row
execute function public.seed_topics_for_new_user();
