-- Subscription + usage tracking for Stripe reader-app model
do $$
begin
  if not exists (
    select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typname = 'subscription_status'
  ) then
    create type public.subscription_status as enum (
      'none',
      'active',
      'trialing',
      'past_due',
      'canceled',
      'incomplete'
    );
  end if;
end $$;

create table if not exists public.user_subscriptions (
  user_id uuid primary key,
  stripe_customer_id text,
  stripe_subscription_id text unique,
  tier text not null,
  status public.subscription_status not null default 'none',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tier_valid check (tier in ('free', 'starter', 'pro', 'power'))
);

create index if not exists idx_user_subscriptions_tier on public.user_subscriptions (tier);
create index if not exists idx_user_subscriptions_customer on public.user_subscriptions (stripe_customer_id);

alter table public.user_subscriptions enable row level security;

drop policy if exists "Users can read own subscription" on public.user_subscriptions;
create policy "Users can read own subscription" on public.user_subscriptions
  for select using (auth.uid() = user_id);

create table if not exists public.usage_periods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  minutes_used numeric not null default 0,
  seconds_used numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint usage_periods_unique_user_period unique (user_id, period_start, period_end)
);

create index if not exists idx_usage_periods_user on public.usage_periods (user_id);
create index if not exists idx_usage_periods_window on public.usage_periods (user_id, period_start, period_end);

alter table public.usage_periods enable row level security;

drop policy if exists "Users can read own usage periods" on public.usage_periods;
create policy "Users can read own usage periods" on public.usage_periods
  for select using (auth.uid() = user_id);

-- Idempotency marker so we only count episode usage once
alter table public.episodes
  add column if not exists usage_recorded_at timestamptz;
