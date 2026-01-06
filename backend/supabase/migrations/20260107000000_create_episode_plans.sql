-- Store producer conversation outcomes (episode spec + personalization) for downstream workflow execution
create table if not exists public.episode_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  resource_id text not null,
  thread_id text,
  assistant_message text,
  confidence double precision,
  episode_spec jsonb not null,
  user_profile jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists episode_plans_user_id_idx on public.episode_plans (user_id);
create index if not exists episode_plans_resource_id_idx on public.episode_plans (resource_id);

create or replace function public.set_episode_plans_timestamps()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.created_at is null then
    new.created_at = now();
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists episode_plans_set_timestamps on public.episode_plans;
create trigger episode_plans_set_timestamps
before insert or update on public.episode_plans
for each row
execute function public.set_episode_plans_timestamps();

alter table public.episode_plans enable row level security;

drop policy if exists "Users can manage their own episode plans" on public.episode_plans;
create policy "Users can manage their own episode plans"
  on public.episode_plans
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
