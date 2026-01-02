-- Track per-call LLM token usage and estimated USD cost.

create table if not exists public.llm_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  episode_id uuid references public.episodes(id) on delete set null,
  topic_id uuid references public.topics(id) on delete set null,
  segment_id uuid references public.episode_segments(id) on delete set null,
  flow text,
  operation text not null,
  provider text,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  cost_usd numeric(12, 6),
  usage jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_llm_usage_events_user_id on public.llm_usage_events (user_id);
create index if not exists idx_llm_usage_events_episode_id on public.llm_usage_events (episode_id);
create index if not exists idx_llm_usage_events_topic_id on public.llm_usage_events (topic_id);
create index if not exists idx_llm_usage_events_segment_id on public.llm_usage_events (segment_id);

alter table public.llm_usage_events enable row level security;

drop policy if exists "Users can read own llm usage events" on public.llm_usage_events;
drop policy if exists "Users can insert own llm usage events" on public.llm_usage_events;

create policy "Users can read own llm usage events" on public.llm_usage_events
  for select using (auth.uid() = user_id);

create policy "Users can insert own llm usage events" on public.llm_usage_events
  for insert with check (auth.uid() = user_id);

