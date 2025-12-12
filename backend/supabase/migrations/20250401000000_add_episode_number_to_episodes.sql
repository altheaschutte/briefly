-- Assign per-user episode numbers for easier referencing
alter table public.episodes
  add column if not exists episode_number integer;

create unique index if not exists idx_episodes_user_episode_number
on public.episodes (user_id, episode_number)
where episode_number is not null;

create or replace function public.next_episode_number(p_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_val integer;
begin
  perform pg_advisory_xact_lock(hashtext('episode_number:' || p_user_id::text));
  select coalesce(max(episode_number), 0) + 1
    into next_val
    from public.episodes
   where user_id = p_user_id;
  return next_val;
end;
$$;

create or replace function public.set_episode_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.episode_number is null then
    new.episode_number := public.next_episode_number(new.user_id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_set_episode_number on public.episodes;
create trigger trg_set_episode_number
before insert on public.episodes
for each row
execute function public.set_episode_number();
