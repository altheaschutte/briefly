-- Store push notification device tokens per user
create table if not exists public.device_tokens (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  token text not null unique,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists device_tokens_user_id_idx on public.device_tokens (user_id);
create index if not exists device_tokens_user_platform_idx on public.device_tokens (user_id, platform);

create or replace function public.set_device_tokens_timestamps()
returns trigger
language plpgsql
security definer
as $$
begin
  if new.last_seen_at is null then
    new.last_seen_at = now();
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists device_tokens_set_timestamps on public.device_tokens;
create trigger device_tokens_set_timestamps
before insert or update on public.device_tokens
for each row
execute function public.set_device_tokens_timestamps();

alter table public.device_tokens enable row level security;

drop policy if exists "Users can select their own device tokens" on public.device_tokens;
create policy "Users can select their own device tokens"
  on public.device_tokens
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own device tokens" on public.device_tokens;
create policy "Users can insert their own device tokens"
  on public.device_tokens
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own device tokens" on public.device_tokens;
create policy "Users can update their own device tokens"
  on public.device_tokens
  for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own device tokens" on public.device_tokens;
create policy "Users can delete their own device tokens"
  on public.device_tokens
  for delete
  using (auth.uid() = user_id);
